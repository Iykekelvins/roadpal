import { OFFER_TTL_MINUTES } from '@repo/shared';
import { and, eq, inArray, lte, sql } from 'drizzle-orm';
import type { DbExecutor } from '../db/database.module.js';
import { offers, requests } from '../db/schema.js';

// Each sweep is a conditional UPDATE ... RETURNING: safe to run on several instances at once
// (each row is changed, and so reported, by exactly one of them) and safe to re-run.

export interface ExpiredOffer {
  id: string;
  requestId: string;
  providerId: string;
  driverId: string;
}

/** Open requests past their deadline -> expired, together with their pending offers. */
export async function expireRequests(db: DbExecutor) {
  return db.transaction(async (tx) => {
    const expired = await tx
      .update(requests)
      .set({ status: 'expired' })
      .where(and(eq(requests.status, 'open'), lte(requests.expiresAt, sql`now()`)))
      .returning({ id: requests.id, driverId: requests.driverId });
    if (!expired.length) return { requests: expired, offers: [] as ExpiredOffer[] };

    // Same relative lock order as accept (request, then offers), so the two can't deadlock.
    const driverOf = new Map(expired.map((r) => [r.id, r.driverId]));
    const expiredOffers = await tx
      .update(offers)
      .set({ status: 'expired', updatedAt: new Date() })
      .where(and(inArray(offers.requestId, [...driverOf.keys()]), eq(offers.status, 'pending')))
      .returning({ id: offers.id, requestId: offers.requestId, providerId: offers.providerId });

    return {
      requests: expired,
      offers: expiredOffers.map((o) => ({ ...o, driverId: driverOf.get(o.requestId)! })),
    };
  });
}

/** Pending offers older than OFFER_TTL_MINUTES -> expired: a stale price or ETA shouldn't be accepted. */
export async function expireStaleOffers(db: DbExecutor): Promise<ExpiredOffer[]> {
  const expired = await db
    .update(offers)
    .set({ status: 'expired', updatedAt: new Date() })
    .where(
      and(
        eq(offers.status, 'pending'),
        lte(offers.createdAt, sql`now() - make_interval(mins => ${OFFER_TTL_MINUTES})`),
      ),
    )
    .returning({ id: offers.id, requestId: offers.requestId, providerId: offers.providerId });
  if (!expired.length) return [];

  const owners = await db
    .select({ id: requests.id, driverId: requests.driverId })
    .from(requests)
    .where(inArray(requests.id, [...new Set(expired.map((o) => o.requestId))]));
  const driverOf = new Map(owners.map((r) => [r.id, r.driverId]));
  return expired.map((o) => ({ ...o, driverId: driverOf.get(o.requestId)! }));
}
