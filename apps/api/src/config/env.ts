import { z } from 'zod';

// Only what the running API needs. DATABASE_URL_DIRECT is read by drizzle-kit, not the app.
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z
    .url()
    .refine((url) => url.startsWith('postgres'), 'Must be a postgres:// connection string'),
  JWT_ACCESS_SECRET: z.string().min(32, 'Must be at least 32 characters (see .env.example)'),
  // Background sweeps (expiry, radius widening, cleanup). Can be turned off, e.g. for local debugging.
  SWEEPS_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});

export type Env = z.infer<typeof EnvSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = EnvSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
