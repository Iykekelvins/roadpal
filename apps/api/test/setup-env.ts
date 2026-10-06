import { resolveTestDatabaseUrl } from './test-database.js';

// Runs before each integration test file. Everything that reads DATABASE_URL (test helpers and the
// full AppModule alike) now gets the test branch. process.env takes precedence over .env in Nest's
// ConfigModule, so the app can't fall back to the dev database.
process.env.DATABASE_URL = resolveTestDatabaseUrl();
