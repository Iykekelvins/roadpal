import { checkOtp, hashOtp, OTP_MAX_ATTEMPTS } from './otp.js';

const now = new Date('2026-01-01T12:00:00Z');
const stored = (overrides: Partial<{ expiresAt: Date; attempts: number }> = {}) => ({
  codeHash: hashOtp('123456'),
  expiresAt: new Date(now.getTime() + 60_000),
  attempts: 1,
  ...overrides,
});

describe('checkOtp', () => {
  it('accepts the right code', () => {
    expect(checkOtp(stored(), '123456', now)).toBe('ok');
  });

  it('rejects a wrong code', () => {
    expect(checkOtp(stored(), '654321', now)).toBe('wrong_code');
  });

  it('reports when no code was requested', () => {
    expect(checkOtp(undefined, '123456', now)).toBe('not_found');
  });

  it('rejects an expired code, even if correct', () => {
    expect(checkOtp(stored({ expiresAt: now }), '123456', now)).toBe('expired');
  });

  it('allows the last permitted attempt', () => {
    expect(checkOtp(stored({ attempts: OTP_MAX_ATTEMPTS }), '123456', now)).toBe('ok');
  });

  it('locks after too many attempts, even if correct', () => {
    expect(checkOtp(stored({ attempts: OTP_MAX_ATTEMPTS + 1 }), '123456', now)).toBe('too_many_attempts');
  });
});
