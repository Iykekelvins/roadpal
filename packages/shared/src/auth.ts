import { z } from 'zod';

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
