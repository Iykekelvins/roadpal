import { ACTIVE_JOB_STATUSES, type IssueType, type LatLng } from '@repo/shared';
import { and, eq, inArray, notExists, notInArray, sql } from 'drizzle-orm';
import type { DbExecutor } from '../db/database.module.js';
import { toEwkt } from '../db/geography.js';
import { jobs, providerProfiles } from '../db/schema.js';

/** Providers whose last location is older than this are treated as gone (dead battery, no signal). */
export const PROVIDER_LOCATION_FRESH_SECONDS = 120;
const MAX_MATCHES = 20;

export interface MatchCriteria {
  location: LatLng;
  issueType: IssueType;
  searchRadiusKm: number;
  /** Check a single provider's eligibility instead of listing all matches. */
  providerId?: string;
  /** Providers to leave out, e.g. the one who just cancelled this request's job. */
  excludeProviderIds?: string[];
}

export interface ProviderMatch {
  providerId: string;
  distanceMeters: number;
}

/** Online, recently-seen, not-busy providers who handle this issue and are in range, nearest first. */
export async function findMatchingProviders(
  db: DbExecutor,
  { location, issueType, searchRadiusKm, providerId, excludeProviderIds = [] }: MatchCriteria,
): Promise<ProviderMatch[]> {
  const point = sql`${toEwkt(location)}::geography`;
  const distance = sql<number>`ST_Distance(${providerProfiles.lastLocation}, ${point})`;

  const rows = await db
    .select({ providerId: providerProfiles.userId, distanceMeters: distance })
    .from(providerProfiles)
    .where(
      and(
        providerId ? eq(providerProfiles.userId, providerId) : undefined,
        excludeProviderIds.length ? notInArray(providerProfiles.userId, excludeProviderIds) : undefined,
        eq(providerProfiles.isOnline, true),
        sql`${providerProfiles.lastLocationAt} > now() - make_interval(secs => ${PROVIDER_LOCATION_FRESH_SECONDS})`,
        sql`${issueType}::issue_type = ANY(${providerProfiles.services})`,
        // Busy providers (already on a job) aren't notified and can't offer.
        notExists(
          db
            .select({ one: sql`1` })
            .from(jobs)
            .where(and(eq(jobs.providerId, providerProfiles.userId), inArray(jobs.status, [...ACTIVE_JOB_STATUSES]))),
        ),
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
