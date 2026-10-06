import { inArray, like } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { Database } from '../src/db/database.module.js';
import * as schema from '../src/db/schema.js';
import { findMatchingProviders } from '../src/matching/find-matching-providers.js';
import { expireRequests, expireStaleOffers } from '../src/sweeps/expire.js';
import { widenSearchRadius } from '../src/sweeps/widen.js';

// Sweeps against the real database. Fixtures use their own phone prefix and are deleted afterwards.
// Sweeps may also touch real dev rows that are genuinely due, so assertions only look at fixture ids.

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
const db: Database = drizzle({ client: pool, schema, casing: 'snake_case' });

const PHONE_PREFIX = '+2347096';
let seq = 0;
const nextPhone = () => `${PHONE_PREFIX}${String(Date.now() % 10_000).padStart(4, '0')}${String(seq++).padStart(2, '0')}`;
const HERE = { lat: 12.0, lng: 8.5 };
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);
const minutesFromNow = (m: number) => new Date(Date.now() + m * 60_000);

async function user(role: 'driver' | 'provider') {
  const [u] = await db.insert(schema.users).values({ phone: nextPhone(), role }).returning();
  return u!;
}

async function request(
  status: 'open' | 'matched',
  expiresAt: Date,
  extra: { searchRadiusKm?: number; lastDispatchedAt?: Date } = {},
) {
  const driver = await user('driver');
  const [r] = await db
    .insert(schema.requests)
    .values({ driverId: driver.id, location: HERE, vehicleType: 'car', issueType: 'flat_tyre', status, expiresAt, ...extra })
    .returning();
  return r!;
}

async function offerOn(requestId: string, status: 'pending' | 'accepted', createdAt: Date) {
  const provider = await user('provider');
  const [o] = await db
    .insert(schema.offers)
    .values({ requestId, providerId: provider.id, priceNaira: 2000, etaMinutes: 10, distanceMeters: 100, status, createdAt })
    .returning();
  return o!;
}

async function statusesOf(table: typeof schema.requests | typeof schema.offers, ids: string[]) {
  const rows = await db.select({ id: table.id, status: table.status }).from(table).where(inArray(table.id, ids));
  return Object.fromEntries(rows.map((r) => [r.id, r.status]));
}

afterAll(async () => {
  await db.delete(schema.users).where(like(schema.users.phone, `${PHONE_PREFIX}%`));
  await pool.end();
});

describe('expireRequests', () => {
  it('expires overdue open requests and their pending offers, and nothing else', async () => {
    const overdue = await request('open', minutesAgo(1));
    const overdueOffer = await offerOn(overdue.id, 'pending', minutesAgo(2));
    const stillOpen = await request('open', minutesFromNow(5));
    const matchedOverdue = await request('matched', minutesAgo(1)); // has a job: not for the sweeper

    const result = await expireRequests(db);

    expect(result.requests.map((r) => r.id)).toContain(overdue.id);
    expect(result.offers.map((o) => o.id)).toContain(overdueOffer.id);
    expect(result.offers.find((o) => o.id === overdueOffer.id)?.driverId).toBe(overdue.driverId);
    expect(await statusesOf(schema.requests, [overdue.id, stillOpen.id, matchedOverdue.id])).toEqual({
      [overdue.id]: 'expired',
      [stillOpen.id]: 'open',
      [matchedOverdue.id]: 'matched',
    });
    expect(await statusesOf(schema.offers, [overdueOffer.id])).toEqual({ [overdueOffer.id]: 'expired' });
  });

  it('two sweeps at once (two API instances) report each request exactly once', async () => {
    const due = [await request('open', minutesAgo(1)), await request('open', minutesAgo(1)), await request('open', minutesAgo(1))];
    const ids = new Set(due.map((r) => r.id));

    const [a, b] = await Promise.all([expireRequests(db), expireRequests(db)]);
    const reported = [...a.requests, ...b.requests].map((r) => r.id).filter((id) => ids.has(id));

    expect(reported.sort()).toEqual([...ids].sort()); // each once: no duplicate notifications
  });
});

describe('expireStaleOffers', () => {
  it('expires pending offers past the TTL only', async () => {
    const r = await request('open', minutesFromNow(5));
    const stale = await offerOn(r.id, 'pending', minutesAgo(6));
    const fresh = await offerOn(r.id, 'pending', minutesAgo(2));
    const acceptedLongAgo = await offerOn(r.id, 'accepted', minutesAgo(30));

    const expired = await expireStaleOffers(db);

    expect(expired.map((o) => o.id)).toContain(stale.id);
    expect(expired.find((o) => o.id === stale.id)?.driverId).toBe(r.driverId);
    expect(await statusesOf(schema.offers, [stale.id, fresh.id, acceptedLongAgo.id])).toEqual({
      [stale.id]: 'expired',
      [fresh.id]: 'pending',
      [acceptedLongAgo.id]: 'accepted',
    });
  });
});

describe('widenSearchRadius', () => {
  const due = { lastDispatchedAt: minutesAgo(4) };

  it('widens only open, unexpired, offer-less requests whose last dispatch is old enough', async () => {
    const widenMe = await request('open', minutesFromNow(1), due);
    const tooRecent = await request('open', minutesFromNow(5), { lastDispatchedAt: minutesAgo(1) });
    const hasPendingOffer = await request('open', minutesFromNow(5), due);
    await offerOn(hasPendingOffer.id, 'pending', minutesAgo(1));
    const atMax = await request('open', minutesFromNow(5), { ...due, searchRadiusKm: 50 });
    const overdue = await request('open', minutesAgo(1), due);
    const matched = await request('matched', minutesFromNow(5), due);
    const all = [widenMe, tooRecent, hasPendingOffer, atMax, overdue, matched];

    const widened = (await widenSearchRadius(db)).filter((w) => all.some((r) => r.id === w.request.id));

    expect(widened.map((w) => w.request.id)).toEqual([widenMe.id]);
    const [w] = widened;
    expect(w!.previousRadiusKm).toBe(10);
    expect(w!.request.searchRadiusKm).toBe(20);
    // The deadline moved out so newly reached providers have time (it was 1 minute away).
    expect(w!.request.expiresAt.getTime()).toBeGreaterThan(Date.now() + 4.5 * 60_000);
    expect(w!.request.lastDispatchedAt.getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it('caps the radius at 50 km', async () => {
    const r = await request('open', minutesFromNow(5), { ...due, searchRadiusKm: 40 });
    const w = (await widenSearchRadius(db)).find((x) => x.request.id === r.id);
    expect(w).toMatchObject({ previousRadiusKm: 40, request: { searchRadiusKm: 50 } });
  });

  it('two sweeps at once widen each request exactly one step', async () => {
    const reqs = [await request('open', minutesFromNow(5), due), await request('open', minutesFromNow(5), due)];
    const ids = new Set(reqs.map((r) => r.id));

    const [a, b] = await Promise.all([widenSearchRadius(db), widenSearchRadius(db)]);
    const reported = [...a, ...b].filter((w) => ids.has(w.request.id));

    expect(reported.map((w) => w.request.id).sort()).toEqual([...ids].sort());
    expect(reported.every((w) => w.request.searchRadiusKm === 20)).toBe(true);
  });
});

describe('outer-ring matching after widening', () => {
  it('notifies only providers beyond the previous radius', async () => {
    const north = (km: number) => ({ lat: HERE.lat + km / 111.2, lng: HERE.lng });
    const near = await user('provider');
    const far = await user('provider');
    for (const [p, km] of [[near, 5], [far, 15]] as const) {
      await db.insert(schema.providerProfiles).values({
        userId: p.id,
        services: ['flat_tyre'],
        serviceRadiusKm: 30,
        isOnline: true,
        lastLocation: north(km),
        lastLocationAt: new Date(),
      });
    }

    const criteria = { location: HERE, issueType: 'flat_tyre' as const, searchRadiusKm: 20 };
    const everyone = (await findMatchingProviders(db, criteria)).map((m) => m.providerId);
    const ring = (await findMatchingProviders(db, { ...criteria, outsideKm: 10 })).map((m) => m.providerId);

    expect(everyone).toEqual(expect.arrayContaining([near.id, far.id]));
    expect(ring).toContain(far.id);
    expect(ring).not.toContain(near.id);
  });
});

