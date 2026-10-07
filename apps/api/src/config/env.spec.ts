import { EXAMPLE_JWT_SECRET, validateEnv } from './env.js';

// A production setup that passes every check; each test breaks one thing.
const good = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://u:p@ep-x-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require',
  JWT_ACCESS_SECRET: 'a-real-random-secret-that-is-at-least-32-chars',
  WEB_ORIGINS: 'https://roadpal.vercel.app',
  TRUST_PROXY_HOPS: '1',
};
const problems = (overrides: Record<string, string>) => {
  try {
    validateEnv({ ...good, ...overrides });
    return '';
  } catch (error) {
    return (error as Error).message;
  }
};

describe('production config checks', () => {
  it('accepts a correct production setup', () => {
    expect(problems({})).toBe('');
  });

  it('refuses the .env.example JWT secret', () => {
    const message = problems({ JWT_ACCESS_SECRET: EXAMPLE_JWT_SECRET });
    expect(message).toContain('forge logins');
    expect(message).toContain('at JWT_ACCESS_SECRET');
  });

  it('refuses an unencrypted database connection', () => {
    const message = problems({ DATABASE_URL: 'postgresql://u:p@host/db' });
    expect(message).toContain('sslmode=require');
    expect(message).toContain('at DATABASE_URL');
  });

  it('refuses plain-http web origins', () => {
    const message = problems({ WEB_ORIGINS: 'https://roadpal.vercel.app,http://evil.example' });
    expect(message).toContain('http://evil.example');
    expect(message).toContain('at WEB_ORIGINS');
  });

  it('refuses TRUST_PROXY_HOPS=0 (all users would share one IP)', () => {
    expect(problems({ TRUST_PROXY_HOPS: '0' })).toContain('at TRUST_PROXY_HOPS');
  });

  it('applies none of this outside production (localhost is plain http)', () => {
    expect(problems({ NODE_ENV: 'development', WEB_ORIGINS: 'http://localhost:3001', TRUST_PROXY_HOPS: '0', DATABASE_URL: 'postgres://u:p@localhost/db' })).toBe('');
  });
});
