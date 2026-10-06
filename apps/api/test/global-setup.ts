import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { directUrlOf, resolveTestDatabaseUrl } from './test-database.js';

// Runs once before the integration suite: brings the test branch up to the latest migration, so new
// migrations never have to be applied to it by hand.
export default async function setup() {
  const url = resolveTestDatabaseUrl();
  const pool = new Pool({ connectionString: directUrlOf(url), connectionTimeoutMillis: 30_000 });
  try {
    await migrate(drizzle({ client: pool }), { migrationsFolder: './drizzle' });
    console.log(`[e2e] test database ${new URL(url).hostname.split('.')[0]} migrated`);
  } finally {
    await pool.end();
  }
}
