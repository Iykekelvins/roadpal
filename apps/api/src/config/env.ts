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
});

export type Env = z.infer<typeof EnvSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = EnvSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
