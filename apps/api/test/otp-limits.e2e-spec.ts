import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { APP_TIMEZONE, OTP_MAX_SENDS_PER_HOUR } from '@repo/shared';
import { like, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import type { Database } from '../src/db/database.module.js';
import * as schema from '../src/db/schema.js';
import { SmsSender } from '../src/sms/sms-sender.js';

// Login-code rate limits, through the real HTTP API. Time is simulated by moving the stored
// timestamps back, so the tests don't have to wait out real cooldowns.

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const db: Database = drizzle({ client: pool, schema, casing: 'snake_case' });

const PHONE_PREFIX = '+2347011';
let seq = 0;
const nextPhone = () => `${PHONE_PREFIX}${String(Date.now() % 10_000).padStart(4, '0')}${String(seq++).padStart(2, '0')}`;
const lagosToday = sql`(now() at time zone ${APP_TIMEZONE})::date`;

async function createApp() {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app as INestApplication<App>;
}

const askForCode = (app: INestApplication<App>, phone: string) =>
  request(app.getHttpServer()).post('/auth/otp/request').send({ phone });

/** Pretend the cooldown has passed (and optionally the whole hour-long window too). */
async function timeTravel(phone: string, { windowOver = false } = {}) {
  await db.execute(sql`
    update otp_codes set created_at = created_at - interval '61 seconds'
      ${windowOver ? sql`, window_started_at = window_started_at - interval '61 minutes'` : sql``}
    where phone = ${phone}`);
}

const resetDailyCount = () => db.execute(sql`delete from sms_daily_counts where day = ${lagosToday}`);

afterAll(async () => {
  await db.delete(schema.otpCodes).where(like(schema.otpCodes.phone, `${PHONE_PREFIX}%`));
  await resetDailyCount();
  await pool.end();
});

describe('login code limits', () => {
  let app: INestApplication<App>;
  beforeAll(async () => {
    app = await createApp();
  });
  afterAll(() => app.close());
  beforeEach(resetDailyCount);

  it('makes a number wait between codes, and says how long', async () => {
    const phone = nextPhone();
    await askForCode(app, phone).expect(200);
    const res = await askForCode(app, phone).expect(429);
    expect(res.body.code).toBe('OTP_RATE_LIMITED');
    expect(res.body.retryAfterSeconds).toBeGreaterThan(0);
    expect(res.body.retryAfterSeconds).toBeLessThanOrEqual(60);
    expect(res.body.message).toMatch(/^Please wait \d+s/);
  });

  it(`allows ${OTP_MAX_SENDS_PER_HOUR} codes an hour per number, then blocks until the hour is over`, async () => {
    const phone = nextPhone();
    for (let i = 0; i < OTP_MAX_SENDS_PER_HOUR; i++) {
      await askForCode(app, phone).expect(200);
      await timeTravel(phone);
    }
    const res = await askForCode(app, phone).expect(429);
    expect(res.body.code).toBe('OTP_RATE_LIMITED');
    expect(res.body.message).toMatch(/Try again in \d+ minutes?/);
    expect(res.body.retryAfterSeconds).toBeGreaterThan(60); // the rest of the hour, not the cooldown

    // An hour later, the count starts again.
    await timeTravel(phone, { windowOver: true });
    await askForCode(app, phone).expect(200);
    const [row] = await db.execute<{ send_count: number }>(sql`select send_count from otp_codes where phone = ${phone}`).then((r) => r.rows);
    expect(row!.send_count).toBe(1);
  });

  it('burning a code with wrong guesses does not reset the hourly count', async () => {
    const phone = nextPhone();
    for (let i = 0; i < OTP_MAX_SENDS_PER_HOUR; i++) {
      await askForCode(app, phone).expect(200);
      await timeTravel(phone);
    }
    // Lock the current code. (The old code deleted dead codes here, wiping the counters.)
    for (let i = 0; i < 6; i++) {
      await request(app.getHttpServer()).post('/auth/otp/verify').send({ phone, code: '000000' });
    }
    await timeTravel(phone);
    const res = await askForCode(app, phone).expect(429);
    expect(res.body.code).toBe('OTP_RATE_LIMITED');
  });

  it('stops all codes once the daily budget is used, without saving the code', async () => {
    const limit = Number(process.env.OTP_DAILY_LIMIT ?? 200);
    await db.execute(sql`insert into sms_daily_counts (day, count) values (${lagosToday}, ${limit})`);
    const phone = nextPhone();

    const res = await askForCode(app, phone).expect(429);
    expect(res.body.code).toBe('OTP_DAILY_LIMIT');
    expect(res.body.retryAfterSeconds).toBeGreaterThan(0);
    expect(res.body.retryAfterSeconds).toBeLessThanOrEqual(24 * 3600);
    // Rolled back together: no code stored for this number, and the count didn't go past the limit.
    const stored = await db.execute(sql`select 1 from otp_codes where phone = ${phone}`);
    expect(stored.rows).toHaveLength(0);
    const [day] = await db.execute<{ count: number }>(sql`select count from sms_daily_counts where day = ${lagosToday}`).then((r) => r.rows);
    expect(day!.count).toBe(limit);
  });

  it('counts every code sent today', async () => {
    await askForCode(app, nextPhone()).expect(200);
    await askForCode(app, nextPhone()).expect(200);
    const [day] = await db.execute<{ count: number }>(sql`select count from sms_daily_counts where day = ${lagosToday}`).then((r) => r.rows);
    expect(day!.count).toBe(2);
  });
});

describe('per-IP burst limit', () => {
  let app: INestApplication<App>;
  beforeAll(async () => {
    app = await createApp(); // fresh in-memory counters
    await resetDailyCount();
  });
  afterAll(() => app.close());

  it('blocks a burst of more than 30 code requests a minute from one address', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 30; i++) statuses.push((await askForCode(app, nextPhone())).status);
    expect(statuses.every((s) => s === 200)).toBe(true);
    const blocked = await askForCode(app, nextPhone()).expect(429);
    expect(blocked.body.message).toBe('Too many attempts from your network. Wait a minute and try again.');
  });
});

describe('SMS delivery', () => {
  it('in demo mode, returns the code so the app can show it', async () => {
    const app = await createApp();
    await resetDailyCount();
    const res = await askForCode(app, nextPhone()).expect(200);
    expect(res.body.demoCode).toMatch(/^\d{6}$/);
    await app.close();
  });

  it('when sending fails: a clear 503, and the person can retry at once (no cooldown)', async () => {
    const failing = { showsCode: false, sendLoginCode: () => Promise.reject(new Error('provider down')) };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SmsSender)
      .useValue(failing)
      .compile();
    const app = moduleRef.createNestApplication<INestApplication<App>>();
    await app.init();
    await resetDailyCount();
    const phone = nextPhone();

    const first = await askForCode(app, phone).expect(503);
    expect(first.body.message).toBe('We couldn’t send your code. Please try again in a moment.');
    expect(first.body).not.toHaveProperty('demoCode');
    // Retrying straight away hits the provider again (503), not the 60s cooldown (429).
    await askForCode(app, phone).expect(503);
    await app.close();
  });
});
