import { z } from 'zod';
import { UserRoleSchema } from './enums';

// Accepts 0803..., 234803..., +234803... (spaces allowed); captures the 10-digit subscriber part.
const NG_MOBILE = /^(?:\+?234|0)([789][01]\d{8})$/;

export const PhoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/\s+/g, ''))
  .refine((value) => NG_MOBILE.test(value), {
    message: 'Enter a valid Nigerian mobile number',
  })
  .transform((value) => `+234${value.match(NG_MOBILE)![1]}`);
export type Phone = z.infer<typeof PhoneSchema>;

export const RequestOtpSchema = z.object({ phone: PhoneSchema });
export type RequestOtpInput = z.infer<typeof RequestOtpSchema>;

export const VerifyOtpSchema = z.object({
  phone: PhoneSchema,
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
  // Only needed when this phone has no account yet.
  role: UserRoleSchema.optional(),
});
export type VerifyOtpInput = z.infer<typeof VerifyOtpSchema>;

// Browser clients send no body token: theirs travels in the httpOnly cookie (see TOKEN_TRANSPORT_HEADER).
export const RefreshTokenSchema = z.object({ refreshToken: z.string().min(1).optional() });
export type RefreshTokenInput = z.infer<typeof RefreshTokenSchema>;

/** Send `X-Token-Transport: cookie` to receive the refresh token as an httpOnly cookie instead of in the body. */
export const TOKEN_TRANSPORT_HEADER = 'x-token-transport';
export const REFRESH_TOKEN_COOKIE = 'rp_refresh';

/** Minimum wait between login codes for one phone number. */
export const OTP_RESEND_COOLDOWN_SECONDS = 60;
/** Most login codes one phone number can request per hour. */
export const OTP_MAX_SENDS_PER_HOUR = 5;
/**
 * 429 error codes for code requests. The body also carries `retryAfterSeconds`.
 * OTP_RATE_LIMITED: this number asked too often. OTP_DAILY_LIMIT: the app-wide daily budget is used up.
 */
export type OtpLimitCode = 'OTP_RATE_LIMITED' | 'OTP_DAILY_LIMIT';
