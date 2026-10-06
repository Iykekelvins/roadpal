import type { IssueType, LatLng, NearbyRequest } from '@repo/shared';
import { and, eq, gt, sql } from 'drizzle-orm';
import type { DbExecutor } from '../db/database.module.js';
import { toEwkt } from '../db/geography.js';
import { offers, requests } from '../db/schema.js';

type RequestRow = typeof requests.$inferSelect;

const MAX_RESULTS = 20;

/** The provider-facing view of a request; used by both the REST feed and the realtime push. */
export function toNearbyRequest(
  row: Pick<RequestRow, 'id' | 'vehicleType' | 'issueType' | 'note' | 'createdAt' | 'expiresAt'>,
  distanceMeters: number,
  myOffer: NearbyRequest['myOffer'] = null,
): NearbyRequest {
  return {
    id: row.id,
    vehicleType: row.vehicleType,
    issueType: row.issueType,
    note: row.note,
    distanceMeters: Math.round(distanceMeters),
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    myOffer,
  };
}

export interface ProviderCriteria {
  providerId: string;
  location: LatLng;
  services: IssueType[];
  serviceRadiusKm: number;
}

/**
 * Open requests a provider could take, nearest first. The mirror of findMatchingProviders.
 * Deliberately excludes the driver's exact location: that's only shared once an offer is accepted.
 */
export async function findNearbyRequests(
  db: DbExecutor,
  { providerId, location, services, serviceRadiusKm }: ProviderCriteria,
): Promise<NearbyRequest[]> {
  const point = sql`${toEwkt(location)}::geography`;
  const distance = sql<number>`ST_Distance(${requests.location}, ${point})`;

  const rows = await db
    .select({
      id: requests.id,
      vehicleType: requests.vehicleType,
      issueType: requests.issueType,
      note: requests.note,
      distanceMeters: distance,
      createdAt: requests.createdAt,
      expiresAt: requests.expiresAt,
      offerId: offers.id,
      offerPrice: offers.priceNaira,
      offerEta: offers.etaMinutes,
      offerStatus: offers.status,
    })
    .from(requests)
    // This provider's own offer, if any (at most one per request, by a unique index).
    .leftJoin(offers, and(eq(offers.requestId, requests.id), eq(offers.providerId, providerId)))
    .where(
      and(
        eq(requests.status, 'open'),
        // Don't rely on status alone: expiry is only swept periodically (Phase 9).
        gt(requests.expiresAt, sql`now()`),
        sql`${requests.issueType} = ANY(${sql.param(services)}::issue_type[])`,
        // Constant radius here is the provider's, so this is the check the GiST index can use.
        sql`ST_DWithin(${requests.location}, ${point}, ${serviceRadiusKm * 1000})`,
        // Per-row: the request's own search radius (it may widen over time).
        sql`ST_DWithin(${requests.location}, ${point}, ${requests.searchRadiusKm} * 1000)`,
      ),
    )
    .orderBy(distance)
    .limit(MAX_RESULTS);

  return rows.map((row) =>
    toNearbyRequest(
      row,
      Number(row.distanceMeters),
      row.offerId
        ? { id: row.offerId, priceNaira: row.offerPrice!, etaMinutes: row.offerEta!, status: row.offerStatus! }
        : null,
    ),
  );
}
