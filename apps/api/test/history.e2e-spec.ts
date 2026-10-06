import { BadRequestException } from '@nestjs/common';
import { like, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { Database } from '../src/db/database.module.js';
import * as schema from '../src/db/schema.js';
import { JobsService } from '../src/jobs/jobs.service.js';
import { ProvidersService } from '../src/providers/providers.service.js';
import { RatingsService } from '../src/ratings/ratings.service.js';
import type { RealtimeGateway } from '../src/realtime/realtime.gateway.js';

// History pagination and earnings against the real database. Fixtures use their own phone prefix
// and are deleted afterwards (cascades remove their requests, offers, jobs and ratings).

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
const db: Database = drizzle({ client: pool, schema, casing: 'snake_case' });
const realtime = { emitToUser: () => undefined } as unknown as RealtimeGateway;
const jobsService = new JobsService(db, realtime);
const providersService = new ProvidersService(db);
const ratingsService = new RatingsService(db);

const PHONE_PREFIX = '+2347097';
let seq = 0;
const nextPhone = () => `${PHONE_PREFIX}${String(Date.now() % 10_000).padStart(4, '0')}${String(seq++).padStart(2, '0')}`;
const HERE = { lat: 12.0, lng: 8.5 };

async function pair() {
  const [driver] = await db.insert(schema.users).values({ phone: nextPhone(), role: 'driver' }).returning();
  const [provider] = await db.insert(schema.users).values({ phone: nextPhone(), role: 'provider' }).returning();
  await db.insert(schema.providerProfiles).values({ userId: provider!.id, services: ['flat_tyre'] });
  return { driver: driver!, provider: provider! };
}

/** Inserts a finished job directly, with exact timestamps (microsecond precision allowed). */
async function finishedJob(
  driverId: string,
  providerId: string,
  opts: { acceptedAt: string; completedAt?: Date; status?: 'completed' | 'cancelled'; price?: number },
) {
  const [request] = await db
    .insert(schema.requests)
    .values({ driverId, location: HERE, vehicleType: 'car', issueType: 'flat_tyre', status: 'resolved', expiresAt: new Date() })
    .returning();
  const [offer] = await db
    .insert(schema.offers)
    .values({ requestId: request!.id, providerId, priceNaira: opts.price ?? 1000, etaMinutes: 10, distanceMeters: 100, status: 'accepted' })
    .returning();
  const [job] = await db
    .insert(schema.jobs)
    .values({
      requestId: request!.id,
      offerId: offer!.id,
      providerId,
      status: opts.status ?? 'completed',
      acceptedAt: sql`${opts.acceptedAt}::timestamptz`,
      completedAt: opts.completedAt ?? new Date(),
    })
    .returning({ id: schema.jobs.id });
  return job!.id;
}

/** Walks every page with the given page size and returns all job ids in order. */
async function allPages(user: { id: string; role: 'driver' | 'provider' }, limit: number) {
  const ids: string[] = [];
  let cursor: string | undefined;
  let pages = 0;
  do {
    const page = await jobsService.history(user, { cursor, limit });
    ids.push(...page.items.map((i) => i.job.id));
    cursor = page.nextCursor ?? undefined;
    pages++;
  } while (cursor && pages < 50);
  return { ids, pages };
}

afterAll(async () => {
  await db.delete(schema.users).where(like(schema.users.phone, `${PHONE_PREFIX}%`));
  await pool.end();
});

describe('job history', () => {
  it('pages through jobs that differ only by microseconds without skipping or repeating any', async () => {
    const { driver, provider } = await pair();
    // All three fall in the same millisecond: a JS Date would round them all to .123.
    const a = await finishedJob(driver.id, provider.id, { acceptedAt: '2026-01-01 12:00:00.123456+00' });
    const b = await finishedJob(driver.id, provider.id, { acceptedAt: '2026-01-01 12:00:00.123400+00' });
    const c = await finishedJob(driver.id, provider.id, { acceptedAt: '2026-01-01 12:00:00.123300+00' });

    const { ids } = await allPages({ id: driver.id, role: 'driver' }, 1);
    expect(ids).toEqual([a, b, c]);
  });

  it('pages newest first, ends with a null cursor, and is the same for both participants', async () => {
    const { driver, provider } = await pair();
    const made: string[] = [];
    for (let i = 0; i < 5; i++) {
      made.push(await finishedJob(driver.id, provider.id, { acceptedAt: `2026-02-0${i + 1} 10:00:00+00` }));
    }
    const newestFirst = [...made].reverse();

    const asDriver = await allPages({ id: driver.id, role: 'driver' }, 2);
    expect(asDriver).toEqual({ ids: newestFirst, pages: 3 }); // 2 + 2 + 1
    const asProvider = await allPages({ id: provider.id, role: 'provider' }, 2);
    expect(asProvider.ids).toEqual(newestFirst);

    const stranger = await pair();
    expect((await jobsService.history({ id: stranger.driver.id, role: 'driver' }, { limit: 20 })).items).toEqual([]);
  });

  it('reports myRating per viewer', async () => {
    const { driver, provider } = await pair();
    const jobId = await finishedJob(driver.id, provider.id, { acceptedAt: '2026-03-01 10:00:00+00' });
    await ratingsService.rate({ id: driver.id, role: 'driver' }, jobId, { score: 4 });

    const [mine] = (await jobsService.history({ id: driver.id, role: 'driver' }, { limit: 20 })).items;
    const [theirs] = (await jobsService.history({ id: provider.id, role: 'provider' }, { limit: 20 })).items;
    expect(mine!.myRating).toBe(4);
    expect(theirs!.myRating).toBeNull();
  });

  it('rejects a tampered cursor with 400', async () => {
    const { driver } = await pair();
    await expect(jobsService.history({ id: driver.id, role: 'driver' }, { cursor: 'abc', limit: 20 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('provider earnings', () => {
  it('counts "today" from Lagos midnight, not UTC midnight', async () => {
    const { driver, provider } = await pair();
    // Lagos is UTC+1 all year (no daylight saving). Lagos midnight today, as an absolute time:
    const HOUR = 3_600_000;
    const lagosNow = new Date(Date.now() + HOUR);
    const lagosMidnight = Date.UTC(lagosNow.getUTCFullYear(), lagosNow.getUTCMonth(), lagosNow.getUTCDate()) - HOUR;

    // 00:30 Lagos today (= 23:30 UTC *yesterday*): must count as today.
    await finishedJob(driver.id, provider.id, { acceptedAt: '2026-01-01 00:00:00+00', completedAt: new Date(lagosMidnight + 0.5 * HOUR), price: 3000 });
    // 23:30 Lagos yesterday: must not.
    await finishedJob(driver.id, provider.id, { acceptedAt: '2026-01-01 00:00:00+00', completedAt: new Date(lagosMidnight - 0.5 * HOUR), price: 2000 });
    // 10 days ago, and a cancelled job (never counts).
    await finishedJob(driver.id, provider.id, { acceptedAt: '2026-01-01 00:00:00+00', completedAt: new Date(Date.now() - 10 * 24 * HOUR), price: 5000 });
    await finishedJob(driver.id, provider.id, { acceptedAt: '2026-01-01 00:00:00+00', status: 'cancelled', price: 9999 });

    const earnings = await providersService.earnings(provider.id);
    expect(earnings.timezone).toBe('Africa/Lagos');
    expect(earnings.today).toEqual({ jobs: 1, naira: 3000 });
    expect(earnings.allTime).toEqual({ jobs: 3, naira: 10_000 });
    expect(earnings.thisWeek.jobs).toBeGreaterThanOrEqual(earnings.today.jobs);
    expect(earnings.thisWeek.jobs).toBeLessThanOrEqual(2);
  });
});
