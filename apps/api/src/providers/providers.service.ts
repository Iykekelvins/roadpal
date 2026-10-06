import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  APP_TIMEZONE,
  MIN_LOCATION_INTERVAL_SECONDS,
  type EarningsView,
  type LatLng,
  type ProviderProfileInput,
  type ProviderStatusInput,
} from '@repo/shared';
import { and, eq, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import { DB, type Database } from '../db/database.module.js';
import { jobs, offers, providerProfiles } from '../db/schema.js';
import { findNearbyRequests } from '../matching/find-nearby-requests.js';
import { notifyWithdrawn, withdrawPendingOffers } from '../offers/withdraw-pending-offers.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { ratingAvg } from './rating.js';

type ProviderProfileRow = typeof providerProfiles.$inferSelect;

// The API shape: rating as an average, storage details (sum/count) kept internal.
export function toProfileResponse(row: ProviderProfileRow) {
  return {
    services: row.services,
    serviceRadiusKm: row.serviceRadiusKm,
    isOnline: row.isOnline,
    lastLocation: row.lastLocation,
    lastLocationAt: row.lastLocationAt,
    ratingAvg: ratingAvg(row.ratingSum, row.ratingCount),
    ratingCount: row.ratingCount,
  };
}

@Injectable()
export class ProvidersService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly realtime: RealtimeGateway,
  ) {}

  async getProfile(userId: string) {
    const [row] = await this.db
      .select()
      .from(providerProfiles)
      .where(eq(providerProfiles.userId, userId));
    // 404 tells the app this provider still needs onboarding.
    if (!row) throw new NotFoundException('Provider profile not set up yet');
    return toProfileResponse(row);
  }

  // PUT semantics: create or fully replace the editable fields. Safe to retry.
  async upsertProfile(userId: string, input: ProviderProfileInput) {
    const [row] = await this.db
      .insert(providerProfiles)
      .values({ userId, ...input })
      .onConflictDoUpdate({
        target: providerProfiles.userId,
        set: { ...input, updatedAt: new Date() },
      })
      .returning();
    return toProfileResponse(row!);
  }

  async setStatus(userId: string, input: ProviderStatusInput) {
    const set = input.isOnline
      ? { isOnline: true, lastLocation: input.location, lastLocationAt: sql`now()` }
      : // Offline providers aren't tracked: drop the location.
        { isOnline: false, lastLocation: null, lastLocationAt: null };

    const { row, withdrawn } = await this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(providerProfiles)
        .set({ ...set, updatedAt: new Date() })
        .where(eq(providerProfiles.userId, userId))
        .returning();
      if (!updated) throw new NotFoundException('Provider profile not set up yet');
      // Going offline means these offers can't be honoured; don't let a driver accept them.
      return { row: updated, withdrawn: input.isOnline ? [] : await withdrawPendingOffers(tx, [userId]) };
    });
    notifyWithdrawn(this.realtime, withdrawn);
    return toProfileResponse(row);
  }

  async updateLocation(userId: string, location: LatLng) {
    // One atomic statement: only online providers, and only if the last update is old enough.
    const [row] = await this.db
      .update(providerProfiles)
      .set({ lastLocation: location, lastLocationAt: sql`now()` })
      .where(
        and(
          eq(providerProfiles.userId, userId),
          eq(providerProfiles.isOnline, true),
          or(
            isNull(providerProfiles.lastLocationAt),
            lt(
              providerProfiles.lastLocationAt,
              sql`now() - make_interval(secs => ${MIN_LOCATION_INTERVAL_SECONDS})`,
            ),
          ),
        ),
      )
      .returning({ lastLocationAt: providerProfiles.lastLocationAt });
    if (row) return { accepted: true, lastLocationAt: row.lastLocationAt };

    // Nothing updated: find out why.
    const [profile] = await this.db
      .select({ isOnline: providerProfiles.isOnline, lastLocationAt: providerProfiles.lastLocationAt })
      .from(providerProfiles)
      .where(eq(providerProfiles.userId, userId));
    if (!profile) throw new NotFoundException('Provider profile not set up yet');
    if (!profile.isOnline) throw new ConflictException('Go online before sending your location');
    // Throttled: not an error, so the app doesn't retry and make it worse.
    return { accepted: false, lastLocationAt: profile.lastLocationAt };
  }

  async nearbyRequests(userId: string) {
    const [profile] = await this.db
      .select()
      .from(providerProfiles)
      .where(eq(providerProfiles.userId, userId));
    if (!profile) throw new NotFoundException('Provider profile not set up yet');
    if (!profile.isOnline || !profile.lastLocation) {
      throw new ConflictException('Go online to see nearby requests');
    }
    const nearby = await findNearbyRequests(this.db, {
      location: profile.lastLocation,
      services: profile.services,
      serviceRadiusKm: profile.serviceRadiusKm,
    });
    return { requests: nearby };
  }

  /** Completed-job totals. Day and week boundaries are Lagos time, not the database's UTC. */
  async earnings(userId: string): Promise<EarningsView> {
    // Midnight (or Monday midnight) in Lagos, as an absolute timestamp.
    const startOf = (unit: 'day' | 'week') =>
      sql`date_trunc(${unit}, now() at time zone ${APP_TIMEZONE}) at time zone ${APP_TIMEZONE}`;
    const bucket = (since?: SQL) => {
      const included = since ? sql`${jobs.completedAt} >= ${since}` : sql`true`;
      return {
        jobs: sql<number>`(count(*) filter (where ${included}))::int`,
        naira: sql<number>`(coalesce(sum(${offers.priceNaira}) filter (where ${included}), 0))::int`,
      };
    };

    const [totals] = await this.db
      .select({ today: bucket(startOf('day')), thisWeek: bucket(startOf('week')), allTime: bucket() })
      .from(jobs)
      .innerJoin(offers, eq(offers.id, jobs.offerId))
      .where(and(eq(jobs.providerId, userId), eq(jobs.status, 'completed')));

    return { timezone: APP_TIMEZONE, ...totals! };
  }
}
