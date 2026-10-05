import type { UserRole } from '@repo/shared';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

// Signed, not encrypted: anyone holding the token can read this. Keep it to IDs and roles.
export interface AccessTokenPayload {
  sub: string; // user id
  role: UserRole;
}
