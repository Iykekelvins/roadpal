import { MIN_LIVE_LOCATION_INTERVAL_SECONDS, type LatLng } from '@repo/shared';
import { and, eq, exists, isNull, lt, or, sql } from 'drizzle-orm';
import type { DbExecutor } from '../db/database.module.js';
import { jobs, providerProfiles, requests } from '../db/schema.js';

export type LiveLocationResult =
  | { accepted: false }
  | { accepted: true; at: Date; enRouteJob: { id: string; driverId: string } | null };

/**
 * Stores a provider's live position (latest only) and finds the job it should be relayed to.
 * Ignored when it comes too soon after the previous one, or when the provider is neither online
 * nor on an en-route job (offline providers aren't tracked).
 */
export async function recordLiveLocation(
  db: DbExecutor,
  providerId: string,
  location: LatLng,
): Promise<LiveLocationResult> {
  const enRouteJobOf = (id: typeof providerProfiles.userId) =>
    db
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.providerId, id), eq(jobs.status, 'en_route')));

  // One atomic statement, so parallel updates can't both slip past the throttle.
  const [row] = await db
    .update(providerProfiles)
    .set({ lastLocation: location, lastLocationAt: sql`now()` })
    .where(
      and(
        eq(providerProfiles.userId, providerId),
        or(eq(providerProfiles.isOnline, true), exists(enRouteJobOf(providerProfiles.userId))),
        or(
          isNull(providerProfiles.lastLocationAt),
          lt(
            providerProfiles.lastLocationAt,
            sql`now() - make_interval(secs => ${MIN_LIVE_LOCATION_INTERVAL_SECONDS})`,
          ),
        ),
      ),
    )
    .returning({ at: providerProfiles.lastLocationAt });
  if (!row?.at) return { accepted: false };

  const [enRouteJob] = await db
    .select({ id: jobs.id, driverId: requests.driverId })
    .from(jobs)
    .innerJoin(requests, eq(requests.id, jobs.requestId))
    .where(and(eq(jobs.providerId, providerId), eq(jobs.status, 'en_route')));

  return { accepted: true, at: row.at, enRouteJob: enRouteJob ?? null };
}
