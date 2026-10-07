import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  APP_TIMEZONE,
  OTP_MAX_SENDS_PER_HOUR,
  OTP_RESEND_COOLDOWN_SECONDS,
  type UserRole,
} from '@repo/shared';
import { randomUUID } from 'node:crypto';
import { and, eq, gt, isNull, lt, lte, or, sql } from 'drizzle-orm';
import type { Env } from '../config/env.js';
import { DB, type Database } from '../db/database.module.js';
import { otpCodes, refreshTokens, smsDailyCounts, users } from '../db/schema.js';
import { ACCESS_TOKEN_TTL_SECONDS, type AccessTokenPayload } from './access-token.js';
import { checkOtp, generateOtp, hashOtp, OTP_TTL_SECONDS } from './otp.js';
import {
  classifyUnclaimedRefresh,
  generateRefreshToken,
  hashRefreshToken,
  REFRESH_TOKEN_TTL_SECONDS,
} from './refresh-token.js';

/** Thrown inside the code-request transaction to roll it back when the daily budget is used up. */
class DailyLimitReached extends Error {}

const OTP_ERRORS = {
  not_found: 'No active code for this number. Request a new code.',
  expired: 'This code has expired. Request a new code.',
  too_many_attempts: 'Too many wrong attempts. Request a new code.',
  wrong_code: 'Incorrect code.',
} as const;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly config: ConfigService<Env, true>,
    private readonly jwt: JwtService,
  ) {}

  async requestOtp(phone: string) {
    const code = generateOtp();
    const dailyLimit = this.config.get('OTP_DAILY_LIMIT', { infer: true });
    // All rate-limit times use the database clock (now()), never a mix of app and DB clocks.
    const windowOver = sql`${otpCodes.windowStartedAt} <= now() - interval '1 hour'`;
    const lagosToday = sql`(now() at time zone ${APP_TIMEZONE})::date`;
    const fresh = {
      codeHash: hashOtp(code),
      expiresAt: new Date(Date.now() + OTP_TTL_SECONDS * 1000),
      attempts: 0,
      createdAt: sql`now()`,
    };

    const outcome = await this.db
      .transaction(async (tx) => {
        // One atomic upsert. It only writes if this number is past its cooldown and under its
        // hourly cap; otherwise it returns nothing. Parallel requests can't both slip through.
        const [stored] = await tx
          .insert(otpCodes)
          .values({ phone, ...fresh, sendCount: 1, windowStartedAt: sql`now()` })
          .onConflictDoUpdate({
            target: otpCodes.phone,
            set: {
              ...fresh,
              // A new hour-long window starts once the old one is over.
              sendCount: sql`case when ${windowOver} then 1 else ${otpCodes.sendCount} + 1 end`,
              windowStartedAt: sql`case when ${windowOver} then now() else ${otpCodes.windowStartedAt} end`,
            },
            setWhere: and(
              lte(otpCodes.createdAt, sql`now() - make_interval(secs => ${OTP_RESEND_COOLDOWN_SECONDS})`),
              or(windowOver, lt(otpCodes.sendCount, OTP_MAX_SENDS_PER_HOUR)),
            ),
          })
          .returning({ phone: otpCodes.phone });
        if (!stored) return 'number_limited' as const;

        // The app-wide daily budget, counted in the same transaction: if it's used up, the throw
        // rolls back the code above too, so nothing is sent and nothing is counted.
        const [counted] = await tx
          .insert(smsDailyCounts)
          .values({ day: lagosToday, count: 1 })
          .onConflictDoUpdate({
            target: smsDailyCounts.day,
            set: { count: sql`${smsDailyCounts.count} + 1` },
            setWhere: lt(smsDailyCounts.count, dailyLimit),
          })
          .returning({ count: smsDailyCounts.count });
        if (!counted) throw new DailyLimitReached();
        return 'ok' as const;
      })
      .catch((error: unknown) => {
        if (error instanceof DailyLimitReached) return 'daily_limited' as const;
        throw error;
      });

    if (outcome === 'number_limited') {
      throw new HttpException(
        { code: 'OTP_RATE_LIMITED', ...(await this.retryAfter(phone)) },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (outcome === 'daily_limited') {
      this.logger.warn(`Daily login-code limit (${dailyLimit}) reached`);
      throw new HttpException(
        {
          message: 'RoadPal can’t send more login codes today. Please try again tomorrow.',
          code: 'OTP_DAILY_LIMIT',
          retryAfterSeconds: await this.secondsUntilLagosMidnight(),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // OTP delivery is mocked: no SMS provider yet. Never expose the code outside development.
    const isDev = this.config.get('NODE_ENV', { infer: true }) === 'development';
    if (isDev) this.logger.log(`OTP for ${phone}: ${code}`);

    return { expiresInSeconds: OTP_TTL_SECONDS, ...(isDev && { devCode: code }) };
  }

  /** Why this number is limited, as a wait time and a message the app can show as-is. */
  private async retryAfter(phone: string) {
    const [row] = await this.db
      .select({
        cooldownLeft: sql<number>`ceil(extract(epoch from ${otpCodes.createdAt} + make_interval(secs => ${OTP_RESEND_COOLDOWN_SECONDS}) - now()))::int`,
        windowLeft: sql<number>`ceil(extract(epoch from ${otpCodes.windowStartedAt} + interval '1 hour' - now()))::int`,
      })
      .from(otpCodes)
      .where(eq(otpCodes.phone, phone));
    const cooldown = Math.max(0, row?.cooldownLeft ?? 0);
    const window = Math.max(0, row?.windowLeft ?? 0);
    // In cooldown: wait it out. Otherwise the hourly cap is what's blocking.
    const retryAfterSeconds = cooldown > 0 ? cooldown : window;
    const minutes = Math.ceil(retryAfterSeconds / 60);
    return {
      retryAfterSeconds,
      message:
        cooldown > 0
          ? `Please wait ${retryAfterSeconds}s before asking for another code.`
          : `Too many codes for this number. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    };
  }

  private async secondsUntilLagosMidnight() {
    const [row] = await this.db.execute<{ s: number }>(
      sql`select ceil(extract(epoch from (date_trunc('day', now() at time zone ${APP_TIMEZONE}) + interval '1 day') - (now() at time zone ${APP_TIMEZONE})))::int as s`,
    ).then((r) => r.rows);
    return row?.s ?? 3600;
  }

  async verifyOtp(phone: string, code: string, role?: UserRole) {
    // Count this attempt atomically before checking, so parallel guesses can't share a count.
    const [stored] = await this.db
      .update(otpCodes)
      .set({ attempts: sql`${otpCodes.attempts} + 1` })
      .where(eq(otpCodes.phone, phone))
      .returning();

    const result = checkOtp(stored, code, new Date());

    if (result !== 'ok') {
      // Expired or locked codes stay dead in place (checked on every attempt) rather than being
      // deleted: the row also holds this number's rate-limit counts, and deleting it would let
      // anyone reset them by burning a code. The hourly cleanup removes it later.
      throw new UnauthorizedException(OTP_ERRORS[result]);
    }

    // Checked before consuming the code, so a new user can pick a role and resubmit the same code.
    const [existing] = await this.db.select().from(users).where(eq(users.phone, phone));
    if (!existing && !role) {
      throw new BadRequestException({
        message: 'New account: choose whether you are a driver or a provider.',
        code: 'ROLE_REQUIRED',
      });
    }

    // Single use: only the request whose DELETE returns the row may proceed.
    const consumed = await this.db
      .delete(otpCodes)
      .where(and(eq(otpCodes.phone, phone), eq(otpCodes.codeHash, stored!.codeHash)))
      .returning();
    if (consumed.length === 0) throw new UnauthorizedException(OTP_ERRORS.not_found);

    const { user, isNewUser } = existing
      ? { user: existing, isNewUser: false }
      : await this.createUser(phone, role!);

    return { ...(await this.issueTokens(user)), user, isNewUser };
  }

  async refresh(refreshToken: string) {
    const tokenHash = hashRefreshToken(refreshToken);
    const now = new Date();

    // Atomic claim: only one request can revoke a live token, so parallel refreshes can't both rotate it.
    const [claimed] = await this.db
      .update(refreshTokens)
      .set({ revokedAt: now })
      .where(
        and(
          eq(refreshTokens.tokenHash, tokenHash),
          isNull(refreshTokens.revokedAt),
          gt(refreshTokens.expiresAt, now),
        ),
      )
      .returning();

    let session = claimed;
    if (!session) {
      const [stored] = await this.db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.tokenHash, tokenHash));
      const result = classifyUnclaimedRefresh(stored, now);

      if (result === 'reuse') {
        this.logger.warn(`Refresh token reuse detected; revoking family ${stored!.familyId}`);
        await this.revokeFamily(stored!.familyId, now);
      }
      // A retry only succeeds while the family is alive, so it can't revive a logged-out or revoked session.
      if (result !== 'retry' || !(await this.familyIsActive(stored!.familyId, now))) {
        throw new UnauthorizedException('Session expired. Log in again.');
      }
      session = stored!;
    }

    const [user] = await this.db.select().from(users).where(eq(users.id, session.userId));
    if (!user) throw new UnauthorizedException('Session expired. Log in again.');

    return this.issueTokens(user, session.familyId);
  }

  async logout(refreshToken: string) {
    const [stored] = await this.db
      .select({ familyId: refreshTokens.familyId })
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, hashRefreshToken(refreshToken)));
    // Unknown tokens are ignored: logout is idempotent and doesn't reveal whether a token existed.
    if (stored) await this.revokeFamily(stored.familyId, new Date());
  }

  private async revokeFamily(familyId: string, now: Date) {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: now })
      .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
  }

  private async familyIsActive(familyId: string, now: Date) {
    const [live] = await this.db
      .select({ id: refreshTokens.id })
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.familyId, familyId),
          isNull(refreshTokens.revokedAt),
          gt(refreshTokens.expiresAt, now),
        ),
      )
      .limit(1);
    return Boolean(live);
  }

  // A new login starts a new family; refreshes continue the existing one.
  private async issueTokens(user: { id: string; role: UserRole }, familyId: string = randomUUID()) {
    const payload: AccessTokenPayload = { sub: user.id, role: user.role };
    const accessToken = await this.jwt.signAsync(payload);

    const refreshToken = generateRefreshToken();
    await this.db.insert(refreshTokens).values({
      userId: user.id,
      familyId,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
    });

    return {
      accessToken,
      accessTokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS,
      refreshToken,
      refreshTokenExpiresIn: REFRESH_TOKEN_TTL_SECONDS,
    };
  }

  private async createUser(phone: string, role: UserRole) {
    // onConflictDoNothing covers two signups for the same phone racing each other.
    const [created] = await this.db.insert(users).values({ phone, role }).onConflictDoNothing().returning();
    if (created) return { user: created, isNewUser: true };

    const [winner] = await this.db.select().from(users).where(eq(users.phone, phone));
    return { user: winner!, isNewUser: false };
  }
}
