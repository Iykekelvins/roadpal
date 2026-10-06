import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { Database } from '../src/db/database.module.js';
import * as schema from '../src/db/schema.js';
import { recordLiveLocation } from '../src/realtime/record-live-location.js';

// Rolled-back integration tests for the live location rules (store, throttle, relay target).

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db: Database = drizzle({ client: pool, schema, casing: 'snake_case' });
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

class Rollback extends Error {}
async function inRolledBackTransaction(fn: (tx: Tx) => Promise<void>) {
  await expect(
    db.transaction(async (tx) => {
      await fn(tx);
      throw new Rollback();
    }),
  ).rejects.toBeInstanceOf(Rollback);
}

const HERE = { lat: 12.0, lng: 8.5 };
const longAgo = () => new Date(Date.now() - 60_000);

async function provider(tx: Tx, phone: string, profile: { isOnline: boolean; lastLocationAt: Date | null }) {
  const [user] = await tx.insert(schema.users).values({ phone, role: 'provider' }).returning();
  await tx.insert(schema.providerProfiles).values({
    userId: user!.id,
    services: ['flat_tyre'],
    lastLocation: profile.lastLocationAt ? HERE : null,
    ...profile,
  });
  return user!;
}

async function jobFor(tx: Tx, providerId: string, status: 'accepted' | 'en_route') {
  const [driver] = await tx.insert(schema.users).values({ phone: '+2347098000001', role: 'driver' }).returning();
  const [request] = await tx
    .insert(schema.requests)
    .values({ driverId: driver!.id, location: HERE, vehicleType: 'car', issueType: 'flat_tyre', status: 'matched', expiresAt: new Date(Date.now() + 600_000) })
    .returning();
  const [offer] = await tx
    .insert(schema.offers)
    .values({ requestId: request!.id, providerId, priceNaira: 3000, etaMinutes: 10, distanceMeters: 500, status: 'accepted' })
    .returning();
  const [job] = await tx.insert(schema.jobs).values({ requestId: request!.id, offerId: offer!.id, providerId, status }).returning();
  return { job: job!, driverId: driver!.id };
}

afterAll(() => pool.end());

describe('recordLiveLocation', () => {
  it('ignores offline providers with no en-route job (they are not tracked)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const p = await provider(tx, '+2347098000010', { isOnline: false, lastLocationAt: null });
      expect(await recordLiveLocation(tx, p.id, HERE)).toEqual({ accepted: false });
    });
  });

  it('stores an online idle provider, with nothing to relay', async () => {
    await inRolledBackTransaction(async (tx) => {
      const p = await provider(tx, '+2347098000011', { isOnline: true, lastLocationAt: longAgo() });
      expect(await recordLiveLocation(tx, p.id, HERE)).toMatchObject({ accepted: true, enRouteJob: null });
    });
  });

  it('throttles an update that comes too soon after the previous one', async () => {
    await inRolledBackTransaction(async (tx) => {
      const p = await provider(tx, '+2347098000012', { isOnline: true, lastLocationAt: longAgo() });
      expect((await recordLiveLocation(tx, p.id, HERE)).accepted).toBe(true);
      expect((await recordLiveLocation(tx, p.id, HERE)).accepted).toBe(false);
    });
  });

  it('relays to the driver of an en-route job, even if the provider toggled offline', async () => {
    await inRolledBackTransaction(async (tx) => {
      const p = await provider(tx, '+2347098000013', { isOnline: false, lastLocationAt: longAgo() });
      const { job, driverId } = await jobFor(tx, p.id, 'en_route');
      expect(await recordLiveLocation(tx, p.id, HERE)).toMatchObject({
        accepted: true,
        enRouteJob: { id: job.id, driverId },
      });
    });
  });

  it('does not relay before the provider is en route', async () => {
    await inRolledBackTransaction(async (tx) => {
      const p = await provider(tx, '+2347098000014', { isOnline: true, lastLocationAt: longAgo() });
      await jobFor(tx, p.id, 'accepted');
      expect(await recordLiveLocation(tx, p.id, HERE)).toMatchObject({ accepted: true, enRouteJob: null });
    });
  });
});
