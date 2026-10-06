import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ACTIVE_REQUEST_STATUSES, REQUEST_TTL_MINUTES, type CreateRequestInput } from '@repo/shared';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { isUniqueViolation } from '../common/db-errors.js';
import { DB, type Database } from '../db/database.module.js';
import { requests } from '../db/schema.js';
import { findMatchingProviders } from '../matching/find-matching-providers.js';
import { toNearbyRequest } from '../matching/find-nearby-requests.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';

@Injectable()
export class RequestsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly realtime: RealtimeGateway,
  ) {}

  async create(driverId: string, input: CreateRequestInput) {
    try {
      const [request] = await this.db
        .insert(requests)
        .values({
          driverId,
          ...input,
          expiresAt: sql`now() + make_interval(mins => ${REQUEST_TTL_MINUTES})`,
        })
        .returning();
      const matches = await findMatchingProviders(this.db, request!);

      // Pushed only after the insert succeeded. Fire-and-forget: providers who aren't connected
      // pick it up from the nearby-requests feed when they reconnect.
      for (const match of matches) {
        this.realtime.emitToUser(match.providerId, 'request:new', toNearbyRequest(request!, match.distanceMeters));
      }

      return { ...request!, matchedProviderCount: matches.length };
    } catch (error) {
      // The partial unique index is the source of truth, so this holds even for simultaneous taps.
      if (isUniqueViolation(error, 'requests_one_active_per_driver')) {
        throw new ConflictException({
          message: 'You already have an active request.',
          code: 'ACTIVE_REQUEST_EXISTS',
        });
      }
      throw error;
    }
  }

  async findActive(driverId: string) {
    const [request] = await this.db
      .select()
      .from(requests)
      .where(and(eq(requests.driverId, driverId), inArray(requests.status, [...ACTIVE_REQUEST_STATUSES])));
    return request ?? null;
  }

  async findOwned(driverId: string, id: string) {
    const [request] = await this.db
      .select()
      .from(requests)
      .where(and(eq(requests.id, id), eq(requests.driverId, driverId)));
    // Same 404 whether it doesn't exist or isn't yours, so request IDs can't be probed.
    if (!request) throw new NotFoundException('Request not found');
    return request;
  }
}
