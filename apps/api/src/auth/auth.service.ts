import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { UserRole } from '@repo/shared';
import { and, eq, sql } from 'drizzle-orm';
import type { Env } from '../config/env.js';
import { DB, type Database } from '../db/database.module.js';
import { otpCodes, users } from '../db/schema.js';
import { ACCESS_TOKEN_TTL_SECONDS, type AccessTokenPayload } from './access-token.js';
import { checkOtp, generateOtp, hashOtp, OTP_TTL_SECONDS } from './otp.js';

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
    const values = {
      codeHash: hashOtp(code),
      expiresAt: new Date(Date.now() + OTP_TTL_SECONDS * 1000),
      attempts: 0,
      createdAt: new Date(),
    };

    await this.db
      .insert(otpCodes)
      .values({ phone, ...values })
      .onConflictDoUpdate({ target: otpCodes.phone, set: values });

    // OTP delivery is mocked: no SMS provider yet. Never expose the code outside development.
    const isDev = this.config.get('NODE_ENV', { infer: true }) === 'development';
    if (isDev) this.logger.log(`OTP for ${phone}: ${code}`);

    return { expiresInSeconds: OTP_TTL_SECONDS, ...(isDev && { devCode: code }) };
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
      // Expired or locked codes are dead; remove them so the user must request a new one.
      if (result === 'expired' || result === 'too_many_attempts') {
        await this.db.delete(otpCodes).where(eq(otpCodes.phone, phone));
      }
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

  private async issueTokens(user: { id: string; role: UserRole }) {
    const payload: AccessTokenPayload = { sub: user.id, role: user.role };
    const accessToken = await this.jwt.signAsync(payload);
    return { accessToken, accessTokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS };
  }

  private async createUser(phone: string, role: UserRole) {
    // onConflictDoNothing covers two signups for the same phone racing each other.
    const [created] = await this.db.insert(users).values({ phone, role }).onConflictDoNothing().returning();
    if (created) return { user: created, isNewUser: true };

    const [winner] = await this.db.select().from(users).where(eq(users.phone, phone));
    return { user: winner!, isNewUser: false };
  }
}
