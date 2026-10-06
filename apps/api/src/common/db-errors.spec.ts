import { isDeadlock, isUniqueViolation, retryOnDeadlock } from './db-errors.js';

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

describe('retryOnDeadlock', () => {
  const deadlock = { message: 'Failed query', cause: { code: '40P01' } };

  it('recognises a wrapped deadlock error', () => {
    expect(isDeadlock(deadlock)).toBe(true);
    expect(isDeadlock({ cause: { code: '23505' } })).toBe(false);
  });

  it('retries after a deadlock and returns the eventual result', async () => {
    let calls = 0;
    const result = await retryOnDeadlock(async () => {
      calls++;
      if (calls === 1) throw deadlock;
      return 'committed';
    });
    expect(result).toBe('committed');
    expect(calls).toBe(2);
  });

  it('gives up after the attempt limit', async () => {
    let calls = 0;
    const failing = retryOnDeadlock(async () => {
      calls++;
      throw deadlock;
    }, 3);
    await expect(failing).rejects.toBe(deadlock);
    expect(calls).toBe(3);
  });

  it('does not retry other errors (e.g. a 409 thrown inside the transaction)', async () => {
    let calls = 0;
    const conflict = new Error('REQUEST_NOT_OPEN');
    await expect(
      retryOnDeadlock(async () => {
        calls++;
        throw conflict;
      }),
    ).rejects.toBe(conflict);
    expect(calls).toBe(1);
  });
});
