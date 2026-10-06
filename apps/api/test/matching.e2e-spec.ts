import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { Database } from '../src/db/database.module.js';
import * as schema from '../src/db/schema.js';
import { findMatchingProviders } from '../src/matching/find-matching-providers.js';
import { findNearbyRequests } from '../src/matching/find-nearby-requests.js';

// Integration test: the matching rules live in SQL, so they're tested against real Postgres + PostGIS.
// Everything runs in a transaction that is rolled back, so the database is left untouched.

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db: Database = drizzle({ client: pool, schema, casing: 'snake_case' });

const SAGAMU = { lat: 6.84, lng: 3.65 };
// ~1.11 km per 0.01° of latitude, so these sit due north of the breakdown at known distances.
const north = (km: number) => ({ lat: SAGAMU.lat + km / 111.2, lng: SAGAMU.lng });

class Rollback extends Error {}

async function inRolledBackTransaction(fn: (tx: Parameters<Parameters<Database['transaction']>[0]>[0]) => Promise<void>) {
  await expect(
    db.transaction(async (tx) => {
      await fn(tx);
      throw new Rollback();
    }),
  ).rejects.toBeInstanceOf(Rollback);
}

afterAll(() => pool.end());

describe('findMatchingProviders', () => {
  it('returns only eligible providers, nearest first', async () => {
    await inRolledBackTransaction(async (tx) => {
      const fixtures = {
        near: { km: 2, services: ['flat_tyre'], radius: 10 },
        far: { km: 6, services: ['flat_tyre', 'puncture'], radius: 10 },
        wontTravelThatFar: { km: 6, services: ['flat_tyre'], radius: 5 },
        outsideSearchRadius: { km: 15, services: ['flat_tyre'], radius: 20 },
        offline: { km: 1, services: ['flat_tyre'], radius: 10, offline: true },
        stale: { km: 1, services: ['flat_tyre'], radius: 10, staleMinutes: 5 },
        wrongService: { km: 1, services: ['needs_air'], radius: 10 },
      } as const;

      const names = Object.keys(fixtures) as (keyof typeof fixtures)[];
      const created = await tx
        .insert(schema.users)
        .values(names.map((_, i) => ({ phone: `+23470000${String(i).padStart(5, '0')}`, role: 'provider' as const })))
        .returning({ id: schema.users.id });
      const idOf = Object.fromEntries(names.map((name, i) => [created[i]!.id, name]));

      await tx.insert(schema.providerProfiles).values(
        names.map((name, i) => {
          const f: { km: number; services: readonly string[]; radius: number; offline?: boolean; staleMinutes?: number } = fixtures[name];
          return {
            userId: created[i]!.id,
            services: [...f.services] as (typeof schema.issueType.enumValues)[number][],
            serviceRadiusKm: f.radius,
            isOnline: !f.offline,
            lastLocation: north(f.km),
            lastLocationAt: new Date(Date.now() - (f.staleMinutes ?? 0) * 60_000),
          };
        }),
      );

      const matches = await findMatchingProviders(tx, {
        location: SAGAMU,
        issueType: 'flat_tyre',
        searchRadiusKm: 10,
      });
      const ours = matches.filter((m) => idOf[m.providerId]);

      expect(ours.map((m) => idOf[m.providerId])).toEqual(['near', 'far']);
      expect(ours[0]!.distanceMeters).toBeGreaterThan(1950);
      expect(ours[0]!.distanceMeters).toBeLessThan(2050);
    });
  });

  it('widening the search radius brings in further providers', async () => {
    await inRolledBackTransaction(async (tx) => {
      const [user] = await tx
        .insert(schema.users)
        .values({ phone: '+2347000099999', role: 'provider' })
        .returning({ id: schema.users.id });
      await tx.insert(schema.providerProfiles).values({
        userId: user!.id,
        services: ['flat_tyre'],
        serviceRadiusKm: 30,
        isOnline: true,
        lastLocation: north(15),
        lastLocationAt: new Date(),
      });

      const criteria = { location: SAGAMU, issueType: 'flat_tyre' as const };
      const at10 = await findMatchingProviders(tx, { ...criteria, searchRadiusKm: 10 });
      const at20 = await findMatchingProviders(tx, { ...criteria, searchRadiusKm: 20 });

      expect(at10.some((m) => m.providerId === user!.id)).toBe(false);
      expect(at20.some((m) => m.providerId === user!.id)).toBe(true);
    });
  });
});

describe('findNearbyRequests', () => {
  it('returns only open, unexpired, in-range requests the provider can handle, nearest first', async () => {
    await inRolledBackTransaction(async (tx) => {
      type Fixture = { km: number; issue: 'flat_tyre' | 'needs_air'; searchKm?: number; status?: 'cancelled'; expired?: boolean };
      const fixtures: Record<string, Fixture> = {
        near: { km: 3, issue: 'flat_tyre' },
        farther: { km: 8, issue: 'flat_tyre' },
        beyondProviderRadius: { km: 13, issue: 'flat_tyre', searchKm: 20 },
        beyondRequestRadius: { km: 9, issue: 'flat_tyre', searchKm: 5 },
        wrongService: { km: 1, issue: 'needs_air' },
        cancelled: { km: 1, issue: 'flat_tyre', status: 'cancelled' },
        expired: { km: 1, issue: 'flat_tyre', expired: true },
      };
      const names = Object.keys(fixtures);

      // One driver per request: the one-active-request rule applies.
      const drivers = await tx
        .insert(schema.users)
        .values(names.map((_, i) => ({ phone: `+23470001${String(i).padStart(5, '0')}`, role: 'driver' as const })))
        .returning({ id: schema.users.id });

      const created = await tx
        .insert(schema.requests)
        .values(
          names.map((name, i) => {
            const f = fixtures[name]!;
            return {
              driverId: drivers[i]!.id,
              location: north(f.km),
              vehicleType: 'car' as const,
              issueType: f.issue,
              status: f.status ?? ('open' as const),
              searchRadiusKm: f.searchKm ?? 10,
              expiresAt: new Date(Date.now() + (f.expired ? -60_000 : 600_000)),
            };
          }),
        )
        .returning({ id: schema.requests.id });
      const nameOf = Object.fromEntries(names.map((name, i) => [created[i]!.id, name]));

      // This provider already offered on "farther": the feed should say so.
      const [provider] = await tx
        .insert(schema.users)
        .values({ phone: '+2347000199999', role: 'provider' })
        .returning({ id: schema.users.id });
      const fartherId = created[names.indexOf('farther')]!.id;
      const [myOffer] = await tx
        .insert(schema.offers)
        .values({ requestId: fartherId, providerId: provider!.id, priceNaira: 3500, etaMinutes: 12, distanceMeters: 8000 })
        .returning({ id: schema.offers.id });

      const nearby = await findNearbyRequests(tx, {
        providerId: provider!.id,
        location: SAGAMU,
        services: ['flat_tyre', 'puncture'],
        serviceRadiusKm: 10,
      });
      const ours = nearby.filter((r) => nameOf[r.id]);

      expect(ours.map((r) => nameOf[r.id])).toEqual(['near', 'farther']);
      // Exact coordinates are not exposed before an offer is accepted.
      expect(ours[0]).not.toHaveProperty('location');
      expect(ours[0]!.myOffer).toBeNull();
      expect(ours[1]!.myOffer).toEqual({ id: myOffer!.id, priceNaira: 3500, etaMinutes: 12, status: 'pending' });
    });
  });
});
