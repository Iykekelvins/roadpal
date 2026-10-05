import { classifyUnclaimedRefresh, REFRESH_RETRY_GRACE_SECONDS } from './refresh-token.js';

const now = new Date('2026-01-01T12:00:00Z');
const secondsAgo = (s: number) => new Date(now.getTime() - s * 1000);
const future = new Date(now.getTime() + 86_400_000);

describe('classifyUnclaimedRefresh', () => {
  it('reports unknown tokens', () => {
    expect(classifyUnclaimedRefresh(undefined, now)).toBe('not_found');
  });

  it('reports expired tokens', () => {
    expect(classifyUnclaimedRefresh({ expiresAt: now, revokedAt: null }, now)).toBe('expired');
  });

  it('treats a token rotated moments ago as a network retry', () => {
    const stored = { expiresAt: future, revokedAt: secondsAgo(5) };
    expect(classifyUnclaimedRefresh(stored, now)).toBe('retry');
  });

  it('treats a token rotated long ago as reuse (possible theft)', () => {
    const stored = { expiresAt: future, revokedAt: secondsAgo(REFRESH_RETRY_GRACE_SECONDS + 1) };
    expect(classifyUnclaimedRefresh(stored, now)).toBe('reuse');
  });
});
