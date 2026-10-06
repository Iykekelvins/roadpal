// Postgres error codes we handle explicitly.
const UNIQUE_VIOLATION = '23505';
const DEADLOCK_DETECTED = '40P01';

interface PgError {
  code?: string;
  constraint?: string;
}

// Drizzle wraps driver errors; the Postgres details live on `cause`.
const pgErrorOf = (error: unknown): PgError | undefined =>
  ((error as { cause?: PgError })?.cause ?? error) as PgError | undefined;

/** True if the error (or the driver error Drizzle wraps) is a unique violation, optionally on a given constraint. */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const pgError = pgErrorOf(error);
  return pgError?.code === UNIQUE_VIOLATION && (!constraint || pgError.constraint === constraint);
}

export const isDeadlock = (error: unknown): boolean => pgErrorOf(error)?.code === DEADLOCK_DETECTED;

/**
 * Runs a transaction, retrying if Postgres aborted it to break a deadlock. The retry starts fresh,
 * sees whatever the other transaction committed, and produces a clean result instead of a 500.
 */
export async function retryOnDeadlock<T>(run: () => Promise<T>, attempts = 3): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (!isDeadlock(error) || attempt >= attempts) throw error;
      // Random back-off so the two transactions don't collide again in lockstep.
      await new Promise((resolve) => setTimeout(resolve, 20 + Math.random() * 80));
    }
  }
}
