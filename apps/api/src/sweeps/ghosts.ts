import { ACTIVE_JOB_STATUSES } from '@repo/shared';
import { and, eq, inArray, isNull, lt, notExists, or, sql } from 'drizzle-orm';
import type { DbExecutor } from '../db/database.module.js';
import { jobs, providerProfiles } from '../db/schema.js';
import { PROVIDER_LOCATION_FRESH_SECONDS } from '../matching/find-matching-providers.js';
import { withdrawPendingOffers, type WithdrawnOffer } from '../offers/withdraw-pending-offers.js';

/**
 * "Ghost" providers: online, but silent for longer than matching tolerates, and not on a job (a
 * provider en route in a dead zone keeps their status; the driver's map shows the staleness).
 * Sets them offline and withdraws their pending offers so no driver accepts someone who's gone.
 */
export async function offlineGhostProviders(
  db: DbExecutor,
): Promise<{ providerIds: string[]; withdrawn: WithdrawnOffer[] }> {
  return db.transaction(async (tx) => {
    const ghosts = await tx
      .update(providerProfiles)
      .set({ isOnline: false, lastLocation: null, lastLocationAt: null, updatedAt: new Date() })
      .where(
        and(
          eq(providerProfiles.isOnline, true),
          or(
            isNull(providerProfiles.lastLocationAt),
            lt(providerProfiles.lastLocationAt, sql`now() - make_interval(secs => ${PROVIDER_LOCATION_FRESH_SECONDS})`),
          ),
          notExists(
            tx
              .select({ one: sql`1` })
              .from(jobs)
              .where(and(eq(jobs.providerId, providerProfiles.userId), inArray(jobs.status, [...ACTIVE_JOB_STATUSES]))),
          ),
        ),
      )
      .returning({ userId: providerProfiles.userId });

    const providerIds = ghosts.map((g) => g.userId);
    // Provider rows first (above), then their offers: the same lock order as accepting an offer.
    return { providerIds, withdrawn: await withdrawPendingOffers(tx, providerIds) };
  });
}
