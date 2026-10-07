import { z } from 'zod';

// Only what the running API needs. DATABASE_URL_DIRECT is read by drizzle-kit, not the app.
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8000),
  DATABASE_URL: z
    .url()
    .refine((url) => url.startsWith('postgres'), 'Must be a postgres:// connection string'),
  JWT_ACCESS_SECRET: z.string().min(32, 'Must be at least 32 characters (see .env.example)'),
  // Path the browser sees for the auth endpoints (the web app proxies /api/* to this API), so the
  // refresh cookie is only sent to them.
  REFRESH_COOKIE_PATH: z.string().startsWith('/').default('/api/auth'),
  // Sites allowed to open a Socket.IO connection (comma-separated). REST doesn't need this: the web
  // app proxies /api/* on its own origin. Sockets connect directly, and Socket.IO's HTTP polling
  // fallback is a cross-origin request.
  WEB_ORIGINS: z
    .string()
    .default('http://localhost:3001')
    .transform((v) => v.split(',').map((o) => o.trim()).filter(Boolean))
    .pipe(z.array(z.url()).min(1)),
  // App-wide cap on login codes per day (Lagos date). The hard ceiling on SMS spend: limit x price.
  OTP_DAILY_LIMIT: z.coerce.number().int().positive().default(200),
  // How many proxies sit in front of the API (e.g. Vercel's rewrite + Render's load balancer = 2).
  // Lets req.ip be the real client from X-Forwarded-For. 0 locally: no proxy, trust nothing.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  // Background sweeps (expiry, radius widening, cleanup). Can be turned off, e.g. for local debugging.
  SWEEPS_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  // How login codes reach people. demo: shown in the app, nothing sent (free, but anyone can log in
  // as any number). termii: real SMS, needs the three TERMII_ settings below.
  SMS_MODE: z.enum(['demo', 'termii']).default('demo'),
  TERMII_API_KEY: z.string().min(1).optional(),
  TERMII_BASE_URL: z.url().optional(), // account-specific, from the Termii dashboard
  TERMII_SENDER_ID: z.string().min(3).max(11).default('RoadPal'), // must be approved by Termii
}).superRefine((env, ctx) => {
  const fail = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });

  if (env.SMS_MODE === 'termii') {
    for (const key of ['TERMII_API_KEY', 'TERMII_BASE_URL'] as const) {
      if (!env[key]) fail(key, 'Required when SMS_MODE=termii');
    }
  }

  // Production refuses to start on settings that would quietly make it insecure or broken.
  // A loud failure at deploy time beats a subtle one in front of users.
  if (env.NODE_ENV === 'production') {
    if (env.JWT_ACCESS_SECRET === EXAMPLE_JWT_SECRET) {
      fail('JWT_ACCESS_SECRET', 'Still the .env.example placeholder: anyone could forge logins. Generate a new one.');
    }
    if (!/[?&]sslmode=(require|verify-ca|verify-full)\b/.test(env.DATABASE_URL)) {
      fail('DATABASE_URL', 'Must use an encrypted connection (sslmode=require).');
    }
    const insecure = env.WEB_ORIGINS.filter((origin) => !origin.startsWith('https://'));
    if (insecure.length) fail('WEB_ORIGINS', `Must all be https:// in production (got ${insecure.join(', ')}).`);
    if (env.TRUST_PROXY_HOPS === 0) {
      fail(
        'TRUST_PROXY_HOPS',
        'Must be at least 1 behind a host like Render, or every user shares one IP and the per-IP limit throttles them all together.',
      );
    }
  }
});

/** The placeholder in .env.example; production refuses to run with it. */
export const EXAMPLE_JWT_SECRET = 'change-me-to-a-random-string-of-at-least-32-chars';

export type Env = z.infer<typeof EnvSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = EnvSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
