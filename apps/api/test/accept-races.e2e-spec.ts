import { HttpException } from '@nestjs/common';
import type { IssueType, LatLng } from '@repo/shared';
import { and, eq, inArray, like } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { Database } from '../src/db/database.module.js';
import * as schema from '../src/db/schema.js';
import { JobsService } from '../src/jobs/jobs.service.js';
import { OffersService } from '../src/offers/offers.service.js';
import type { RealtimeGateway } from '../src/realtime/realtime.gateway.js';

// Concurrency tests: races need separate transactions on separate connections, so these run the
// real services against the real database (no wrapping transaction) and clean up afterwards.

process.loadEnvFile('.env');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
const db: Database = drizzle({ client: pool, schema, casing: 'snake_case' });

const realtime = { emitToUser: () => undefined } as unknown as RealtimeGateway;
const offersService = new OffersService(db, realtime);
const jobsService = new JobsService(db, realtime);

// Fixtures live near Kano, far from any dev data, under a phone prefix used only by this file.
const PHONE_PREFIX = '+2347099';
const KANO: LatLng = { lat: 12.0, lng: 8.5 };
let phoneSeq = 0;
const nextPhone = () => `${PHONE_PREFIX}${String(Date.now() % 10_000).padStart(4, '0')}${String(phoneSeq++).padStart(2, '0')}`;

async function createDriver() {
  const [user] = await db.insert(schema.users).values({ phone: nextPhone(), role: 'driver' }).returning();
  return user!;
}

async function createProvider(services: IssueType[] = ['flat_tyre']) {
  const [user] = await db.insert(schema.users).values({ phone: nextPhone(), role: 'provider' }).returning();
  await db.insert(schema.providerProfiles).values({
    userId: user!.id,
    services,
    serviceRadiusKm: 20,
    isOnline: true,
    lastLocation: KANO,
    lastLocationAt: new Date(),
  });
  return user!;
}

async function createRequest(driverId: string) {
  const [request] = await db
    .insert(schema.requests)
    .values({
      driverId,
      location: KANO,
      vehicleType: 'car',
      issueType: 'flat_tyre',
      expiresAt: new Date(Date.now() + 10 * 60_000),
    })
    .returning();
  return request!;
}

const offer = (providerId: string, requestId: string) =>
  offersService.create(providerId, requestId, { priceNaira: 3000, etaMinutes: 15 });

/** The machine-readable code from a rejected service call, e.g. 'REQUEST_NOT_OPEN'. */
function errorCode(result: PromiseSettledResult<unknown>) {
  if (result.status === 'fulfilled') return 'OK';
  const error = result.reason;
  if (error instanceof HttpException) {
    const body = error.getResponse();
    return (typeof body === 'object' && 'code' in body ? body.code : error.getStatus()) as string;
  }
  return `UNEXPECTED: ${(error as { cause?: { code?: string } }).cause?.code ?? ''} ${(error as Error).message}`;
}

afterAll(async () => {
  // Cascades remove the fixtures' profiles, requests, offers and jobs.
  await db.delete(schema.users).where(like(schema.users.phone, `${PHONE_PREFIX}%`));
  await pool.end();
});

describe('accepting offers under concurrency', () => {
  it('two simultaneous accepts on one request create exactly one job', async () => {
    const driver = await createDriver();
    const [p1, p2] = [await createProvider(), await createProvider()];
    const request = await createRequest(driver.id);
    const [o1, o2] = [await offer(p1.id, request.id), await offer(p2.id, request.id)];

    const results = await Promise.allSettled([
      jobsService.acceptOffer(driver.id, o1.id),
      jobsService.acceptOffer(driver.id, o2.id),
    ]);

    expect(results.map(errorCode).sort()).toEqual(['OK', 'REQUEST_NOT_OPEN']);
    const jobs = await db.select().from(schema.jobs).where(eq(schema.jobs.requestId, request.id));
    expect(jobs).toHaveLength(1);
    const statuses = await db
      .select({ status: schema.offers.status })
      .from(schema.offers)
      .where(eq(schema.offers.requestId, request.id));
    expect(statuses.map((s) => s.status).sort()).toEqual(['accepted', 'rejected']);
  });

  it('two drivers accepting the same provider at once: one job, loser request back to open', async () => {
    const [d1, d2] = [await createDriver(), await createDriver()];
    const provider = await createProvider();
    const [r1, r2] = [await createRequest(d1.id), await createRequest(d2.id)];
    const [o1, o2] = [await offer(provider.id, r1.id), await offer(provider.id, r2.id)];

    const results = await Promise.allSettled([
      jobsService.acceptOffer(d1.id, o1.id),
      jobsService.acceptOffer(d2.id, o2.id),
    ]);

    const codes = results.map(errorCode);
    expect(codes.filter((c) => c === 'OK')).toHaveLength(1);
    // The loser gets a clean, actionable 409, never a 500.
    expect(codes.find((c) => c !== 'OK')).toMatch(/^(OFFER_NOT_PENDING|PROVIDER_BUSY)$/);

    const jobs = await db.select().from(schema.jobs).where(eq(schema.jobs.providerId, provider.id));
    expect(jobs).toHaveLength(1);
    const loserRequestId = jobs[0]!.requestId === r1.id ? r2.id : r1.id;
    const [loser] = await db.select().from(schema.requests).where(eq(schema.requests.id, loserRequestId));
    expect(loser!.status).toBe('open');
  });

  it('two providers cross-bidding on two requests, accepted at once: no deadlock error leaks out', async () => {
    // P1 and P2 both offer on R1 and R2. Driver 1 accepts P1 while driver 2 accepts P2: each accept
    // rejects/withdraws an offer the other holds, the classic cross-lock pattern.
    const [d1, d2] = [await createDriver(), await createDriver()];
    const [p1, p2] = [await createProvider(), await createProvider()];
    const [r1, r2] = [await createRequest(d1.id), await createRequest(d2.id)];
    const o11 = await offer(p1.id, r1.id);
    await offer(p2.id, r1.id);
    await offer(p1.id, r2.id);
    const o22 = await offer(p2.id, r2.id);

    const results = await Promise.allSettled([
      jobsService.acceptOffer(d1.id, o11.id),
      jobsService.acceptOffer(d2.id, o22.id),
    ]);

    expect(results.map(errorCode)).toEqual(['OK', 'OK']);
    const jobs = await db.select().from(schema.jobs).where(inArray(schema.jobs.requestId, [r1.id, r2.id]));
    expect(jobs).toHaveLength(2);
  });

  it('an offer racing an accept is never left pending on a matched request', async () => {
    for (let round = 0; round < 5; round++) {
      const driver = await createDriver();
      const [winner, late] = [await createProvider(), await createProvider()];
      const request = await createRequest(driver.id);
      const winningOffer = await offer(winner.id, request.id);

      const [acceptResult, offerResult] = await Promise.allSettled([
        jobsService.acceptOffer(driver.id, winningOffer.id),
        offer(late.id, request.id),
      ]);

      expect(errorCode(acceptResult)).toBe('OK');
      // The late offer either lost the race cleanly (request no longer available) or landed first
      // and was then rejected by the accept.
      expect(['OK', '404']).toContain(String(errorCode(offerResult)));
      const pending = await db
        .select()
        .from(schema.offers)
        .where(and(eq(schema.offers.requestId, request.id), inArray(schema.offers.status, ['pending'])));
      expect(pending).toHaveLength(0);
    }
  }, 120_000);
});
