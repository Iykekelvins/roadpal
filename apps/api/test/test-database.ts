// Resolves the database integration tests may use, and refuses anything that could be the dev
// database. Tests (sweeps especially) act on whole tables, so they must never run against dev data.

const hostOf = (url: string) => new URL(url).hostname.replace('-pooler', '');

export function resolveTestDatabaseUrl(): string {
  process.loadEnvFile('.env');
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) {
    throw new Error('TEST_DATABASE_URL is not set. Integration tests need their own database (a Neon branch).');
  }
  const devUrls = [process.env.DATABASE_URL, process.env.DATABASE_URL_DIRECT].filter(Boolean) as string[];
  if (devUrls.some((dev) => hostOf(dev) === hostOf(testUrl))) {
    throw new Error('TEST_DATABASE_URL points at the dev database. Refusing to run integration tests.');
  }
  return testUrl;
}

/** Neon's direct (non-pooled) host is the pooled one without "-pooler"; migrations prefer it. */
export const directUrlOf = (pooledUrl: string): string => {
  const url = new URL(pooledUrl);
  url.hostname = url.hostname.replace('-pooler', '');
  return url.toString();
};
