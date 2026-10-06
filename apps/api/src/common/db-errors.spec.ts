import { isUniqueViolation } from './db-errors.js';

const pgError = { code: '23505', constraint: 'requests_one_active_per_driver' };

describe('isUniqueViolation', () => {
  it('recognises a raw driver error', () => {
    expect(isUniqueViolation(pgError)).toBe(true);
  });

  it('recognises a driver error wrapped by Drizzle', () => {
    expect(isUniqueViolation({ message: 'Failed query', cause: pgError })).toBe(true);
  });

  it('matches only the named constraint when one is given', () => {
    expect(isUniqueViolation(pgError, 'requests_one_active_per_driver')).toBe(true);
    expect(isUniqueViolation(pgError, 'users_phone_unique')).toBe(false);
  });

  it('ignores other errors', () => {
    expect(isUniqueViolation({ code: '23503' })).toBe(false);
    expect(isUniqueViolation(new Error('boom'))).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
  });
});
