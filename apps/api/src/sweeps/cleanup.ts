import { lt, or, sql } from 'drizzle-orm';
import type { DbExecutor } from '../db/database.module.js';
import { otpCodes, refreshTokens } from '../db/schema.js';

/** How long rotated (revoked) refresh tokens are kept so reuse of a stolen one is still detected. */
export const REVOKED_TOKEN_RETENTION_DAYS = 7;

/**
 * Deletes rows that no longer serve any purpose. Revoked refresh tokens are kept for a while: they
 * are what lets reuse detection recognise a stolen, already-rotated token and revoke its family.
 */
export async function cleanupExpiredAuthData(db: DbExecutor) {
  const tokens = await db
    .delete(refreshTokens)
    .where(
      or(
        lt(refreshTokens.expiresAt, sql`now()`),
        lt(refreshTokens.revokedAt, sql`now() - make_interval(days => ${REVOKED_TOKEN_RETENTION_DAYS})`),
      ),
    )
    .returning({ id: refreshTokens.id });

  const otps = await db
    .delete(otpCodes)
    .where(lt(otpCodes.expiresAt, sql`now() - interval '1 hour'`))
    .returning({ phone: otpCodes.phone });

  return { refreshTokens: tokens.length, otpCodes: otps.length };
}
