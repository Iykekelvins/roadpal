import { and, eq, inArray } from 'drizzle-orm';
import type { DbExecutor } from '../db/database.module.js';
import { offers, requests } from '../db/schema.js';
import type { RealtimeGateway } from '../realtime/realtime.gateway.js';

export interface WithdrawnOffer {
  id: string;
  requestId: string;
  driverId: string;
}

/**
 * Withdraws the pending offers of providers who can no longer honour them (went offline, or were
 * detected as gone). Run inside the same transaction that changed the provider row: provider first,
 * then offers, the same lock order as accepting an offer.
 */
export async function withdrawPendingOffers(db: DbExecutor, providerIds: string[]): Promise<WithdrawnOffer[]> {
  if (!providerIds.length) return [];
  const withdrawn = await db
    .update(offers)
    .set({ status: 'withdrawn', updatedAt: new Date() })
    .where(and(inArray(offers.providerId, providerIds), eq(offers.status, 'pending')))
    .returning({ id: offers.id, requestId: offers.requestId });
  if (!withdrawn.length) return [];

  const owners = await db
    .select({ id: requests.id, driverId: requests.driverId })
    .from(requests)
    .where(inArray(requests.id, [...new Set(withdrawn.map((o) => o.requestId))]));
  const driverOf = new Map(owners.map((r) => [r.id, r.driverId]));
  return withdrawn.map((o) => ({ ...o, driverId: driverOf.get(o.requestId)! }));
}

/** Tells each affected driver (after commit) that an offer they could see is gone. */
export function notifyWithdrawn(realtime: RealtimeGateway, withdrawn: WithdrawnOffer[]) {
  for (const o of withdrawn) {
    realtime.emitToUser(o.driverId, 'offer:withdrawn', { offerId: o.id, requestId: o.requestId });
  }
}
