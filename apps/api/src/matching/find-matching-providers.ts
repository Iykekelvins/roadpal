import type { IssueType, LatLng } from '@repo/shared';
import { and, eq, sql } from 'drizzle-orm';
import type { DbExecutor } from '../db/database.module.js';
import { toEwkt } from '../db/geography.js';
import { providerProfiles } from '../db/schema.js';

/** Providers whose last location is older than this are treated as gone (dead battery, no signal). */
export const PROVIDER_LOCATION_FRESH_SECONDS = 120;
const MAX_MATCHES = 20;

export interface MatchCriteria {
  location: LatLng;
  issueType: IssueType;
  searchRadiusKm: number;
  /** Check a single provider's eligibility instead of listing all matches. */
  providerId?: string;
}

export interface ProviderMatch {
  providerId: string;
  distanceMeters: number;
}

/** Online, recently-seen providers who handle this issue and are in range, nearest first. */
export async function findMatchingProviders(
  db: DbExecutor,
  { location, issueType, searchRadiusKm, providerId }: MatchCriteria,
): Promise<ProviderMatch[]> {
  const point = sql`${toEwkt(location)}::geography`;
  const distance = sql<number>`ST_Distance(${providerProfiles.lastLocation}, ${point})`;

  const rows = await db
    .select({ providerId: providerProfiles.userId, distanceMeters: distance })
    .from(providerProfiles)
    .where(
      and(
        providerId ? eq(providerProfiles.userId, providerId) : undefined,
        eq(providerProfiles.isOnline, true),
        sql`${providerProfiles.lastLocationAt} > now() - make_interval(secs => ${PROVIDER_LOCATION_FRESH_SECONDS})`,
        sql`${issueType}::issue_type = ANY(${providerProfiles.services})`,
        // Constant radius: the GiST index can turn this into a bounding-box lookup.
        sql`ST_DWithin(${providerProfiles.lastLocation}, ${point}, ${searchRadiusKm * 1000})`,
        // Per-row radius (how far this provider will travel): can't use the index, so it only
        // filters the rows the check above already narrowed down.
        sql`ST_DWithin(${providerProfiles.lastLocation}, ${point}, ${providerProfiles.serviceRadiusKm} * 1000)`,
      ),
    )
    .orderBy(distance)
    .limit(MAX_MATCHES);

  return rows.map((row) => ({ ...row, distanceMeters: Math.round(Number(row.distanceMeters)) }));
}
