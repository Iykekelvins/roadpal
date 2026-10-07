// Applies pending migrations from ./drizzle, for deploys (Render's build step).
//
// Why not `drizzle-kit migrate`: without an interactive terminal (a CI log) it can fail without
// printing the reason. This uses drizzle-orm's migrator (the same one the test setup uses), which
// reads the same migration files and records them in the same drizzle.__drizzle_migrations table,
// so it stays compatible with `pnpm db:migrate` locally. And it always prints the actual error.
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

try {
  process.loadEnvFile('.env'); // local runs; on Render the variables are already in the environment
} catch {}

const url = process.env.DATABASE_URL_DIRECT;
if (!url) {
  console.error('DATABASE_URL_DIRECT is not set: migrations need the direct (non-pooled) Neon URL.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 30_000 });
const started = Date.now();
try {
  await migrate(drizzle({ client: pool }), { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });
  const { rows } = await pool.query('select count(*)::int as n from drizzle.__drizzle_migrations');
  console.log(`Migrations up to date (${rows[0].n} applied) in ${Date.now() - started} ms`);
} catch (error) {
  // The useful part is usually the Postgres error underneath drizzle's wrapper.
  const pgError = error?.cause ?? error;
  console.error('Migration failed:', pgError.message);
  if (pgError.code) console.error(`  Postgres code ${pgError.code}${pgError.detail ? `: ${pgError.detail}` : ''}`);
  if (pgError.code === '42P07' || pgError.code === '42710') {
    console.error(
      '  Hint: the database already has these objects but no record of applying them. A Neon\n' +
        '  "schema only" branch does this (it copies tables, not drizzle\'s migration history).\n' +
        '  Recreate the branch empty and deploy again.',
    );
  }
  process.exitCode = 1;
} finally {
  await pool.end();
}
