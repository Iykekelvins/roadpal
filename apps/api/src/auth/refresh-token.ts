import { createHash, randomBytes } from 'node:crypto';

export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
// A revoked token presented again within this window is treated as a network retry, not theft.
export const REFRESH_RETRY_GRACE_SECONDS = 30;

export const generateRefreshToken = (): string => randomBytes(32).toString('base64url');

// Plain SHA-256 is enough here: the token is 256 random bits, so it can't be brute-forced from its hash.
export const hashRefreshToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

export type UnclaimedRefreshResult = 'not_found' | 'expired' | 'retry' | 'reuse';

interface StoredRefreshToken {
  expiresAt: Date;
  revokedAt: Date | null;
}

// Explains why an atomic claim failed: the token was unknown, expired, or already rotated.
export function classifyUnclaimedRefresh(
  stored: StoredRefreshToken | undefined,
  now: Date,
): UnclaimedRefreshResult {
  if (!stored) return 'not_found';
  if (stored.expiresAt <= now) return 'expired';
  if (!stored.revokedAt) return 'not_found'; // unreachable unless the row changed between queries
  const secondsSinceRevoked = (now.getTime() - stored.revokedAt.getTime()) / 1000;
  return secondsSinceRevoked <= REFRESH_RETRY_GRACE_SECONDS ? 'retry' : 'reuse';
}
