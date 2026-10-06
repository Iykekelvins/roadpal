import type { IssueType, LatLng } from '@repo/shared';
import { and, eq, gt, sql } from 'drizzle-orm';
import type { DbExecutor } from '../db/database.module.js';
import { toEwkt } from '../db/geography.js';
import { requests } from '../db/schema.js';

const MAX_RESULTS = 20;

export interface ProviderCriteria {
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
  { location, services, serviceRadiusKm }: ProviderCriteria,
) {
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
    })
    .from(requests)
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

  return rows.map((row) => ({ ...row, distanceMeters: Math.round(Number(row.distanceMeters)) }));
}
