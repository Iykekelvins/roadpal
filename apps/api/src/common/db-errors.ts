// Postgres error code for unique constraint violations.
const UNIQUE_VIOLATION = '23505';

interface PgError {
  code?: string;
  constraint?: string;
}

/** True if the error (or the driver error Drizzle wraps) is a unique violation, optionally on a given constraint. */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const pgError = ((error as { cause?: PgError })?.cause ?? error) as PgError;
  return pgError?.code === UNIQUE_VIOLATION && (!constraint || pgError.constraint === constraint);
}
