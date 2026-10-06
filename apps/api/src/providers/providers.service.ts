import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { ProviderProfileInput } from '@repo/shared';
import { eq } from 'drizzle-orm';
import { DB, type Database } from '../db/database.module.js';
import { providerProfiles } from '../db/schema.js';

type ProviderProfileRow = typeof providerProfiles.$inferSelect;

// The API shape: rating as an average, storage details (sum/count) kept internal.
export function toProfileResponse(row: ProviderProfileRow) {
  return {
    services: row.services,
    serviceRadiusKm: row.serviceRadiusKm,
    isOnline: row.isOnline,
    lastLocation: row.lastLocation,
    lastLocationAt: row.lastLocationAt,
    ratingAvg: row.ratingCount ? Math.round((row.ratingSum / row.ratingCount) * 10) / 10 : null,
    ratingCount: row.ratingCount,
  };
}

@Injectable()
export class ProvidersService {
  constructor(@Inject(DB) private readonly db: Database) {}

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
}
