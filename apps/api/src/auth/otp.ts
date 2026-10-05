import { createHash, randomInt } from 'node:crypto';

export const OTP_TTL_SECONDS = 5 * 60;
export const OTP_MAX_ATTEMPTS = 5;

// crypto.randomInt, not Math.random: OTPs must be unpredictable.
export const generateOtp = (): string => randomInt(0, 1_000_000).toString().padStart(6, '0');

export const hashOtp = (code: string): string => createHash('sha256').update(code).digest('hex');
