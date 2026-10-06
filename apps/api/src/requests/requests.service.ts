import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ACTIVE_REQUEST_STATUSES, REQUEST_TTL_MINUTES, type CreateRequestInput } from '@repo/shared';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { isUniqueViolation } from '../common/db-errors.js';
import { DB, type Database } from '../db/database.module.js';
import { offers, requests } from '../db/schema.js';
import { dispatchRequest } from '../matching/dispatch-request.js';
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
      const matchedProviderCount = await dispatchRequest(this.db, this.realtime, request!);
      return { ...request!, matchedProviderCount };
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

  /**
   * open -> cancelled. Like accept, a conditional UPDATE: if the driver cancels while accepting
   * (or the sweep expires it), exactly one of them changes the row and the other sees "not open".
   * Locks request then offers, the same order as accept and expiry, so they can't deadlock.
   */
  async cancel(driverId: string, id: string) {
    const outcome = await this.db.transaction(async (tx) => {
      const [cancelled] = await tx
        .update(requests)
        .set({ status: 'cancelled' })
        .where(and(eq(requests.id, id), eq(requests.driverId, driverId), eq(requests.status, 'open')))
        .returning();
      if (!cancelled) return null;
      // The driver declined every pending offer at once.
      const rejected = await tx
        .update(offers)
        .set({ status: 'rejected', updatedAt: new Date() })
        .where(and(eq(offers.requestId, id), eq(offers.status, 'pending')))
        .returning({ id: offers.id, providerId: offers.providerId });
      return { request: cancelled, rejected };
    });

    if (!outcome) {
      const request = await this.findOwned(driverId, id); // 404 if missing or not theirs
      throw new ConflictException({
        message:
          request.status === 'matched'
            ? 'A vulcanizer is already on the way. Cancel the job instead.'
            : 'This request is no longer open.',
        code: 'REQUEST_NOT_OPEN',
      });
    }

    for (const { id: offerId, providerId } of outcome.rejected) {
      this.realtime.emitToUser(providerId, 'offer:rejected', { offerId, requestId: id });
    }
    return outcome.request;
  }
}
