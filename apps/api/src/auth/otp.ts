import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

export const OTP_TTL_SECONDS = 5 * 60;
export const OTP_MAX_ATTEMPTS = 5;

// crypto.randomInt, not Math.random: OTPs must be unpredictable.
export const generateOtp = (): string => randomInt(0, 1_000_000).toString().padStart(6, '0');

export const hashOtp = (code: string): string => createHash('sha256').update(code).digest('hex');

export type OtpCheckResult = 'ok' | 'not_found' | 'expired' | 'too_many_attempts' | 'wrong_code';

interface StoredOtp {
  codeHash: string;
  expiresAt: Date;
  attempts: number; // already includes the current attempt
}

export function checkOtp(stored: StoredOtp | undefined, code: string, now: Date): OtpCheckResult {
  if (!stored) return 'not_found';
  if (stored.expiresAt <= now) return 'expired';
  if (stored.attempts > OTP_MAX_ATTEMPTS) return 'too_many_attempts';
  // Constant-time compare so response timing doesn't leak how much of the hash matched.
  const matches = timingSafeEqual(Buffer.from(hashOtp(code)), Buffer.from(stored.codeHash));
  return matches ? 'ok' : 'wrong_code';
}
