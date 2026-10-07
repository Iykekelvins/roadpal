import { defineConfig } from 'drizzle-kit';

// Locally, settings come from .env; on Render there's no file, only environment variables.
try {
  process.loadEnvFile('.env');
} catch {
  // no .env: use the environment as-is
}

const url = process.env.DATABASE_URL_DIRECT;
if (!url) throw new Error('DATABASE_URL_DIRECT is not set (see .env.example)');

// Migrations use the direct (non-pooled) connection; the running app uses the pooled one.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  casing: 'snake_case',
  dbCredentials: { url },
});
