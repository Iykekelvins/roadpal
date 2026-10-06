import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import type { Env } from '../config/env.js';
import { DB, type Database } from '../db/database.module.js';
import { dispatchRequest } from '../matching/dispatch-request.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { expireRequests, expireStaleOffers, type ExpiredOffer } from './expire.js';
import { widenSearchRadius } from './widen.js';

export const SWEEP_INTERVAL_MS = 30_000;

/**
 * Periodic, database-driven background work. Deadlines live in the rows (not in timers), so
 * nothing is lost on restart, and each sweep is safe to run on several instances at once.
 */
@Injectable()
export class SweeperService {
  private readonly logger = new Logger(SweeperService.name);
  private running = false;

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly realtime: RealtimeGateway,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Interval(SWEEP_INTERVAL_MS)
  async tick() {
    if (!this.config.get('SWEEPS_ENABLED', { infer: true })) return;
    // On a slow network a sweep can outlast the interval; don't stack runs on top of each other.
    if (this.running) return;
    this.running = true;
    try {
      await this.runOnce();
    } catch (error) {
      this.logger.error('Sweep failed', error as Error);
    } finally {
      this.running = false;
    }
  }

  async runOnce() {
    // Order matters: an offer that just went stale no longer blocks widening, and overdue requests
    // are expired before they could be widened.
    this.notifyExpiredOffers(await expireStaleOffers(this.db));

    const expired = await expireRequests(this.db);
    for (const r of expired.requests) {
      this.realtime.emitToUser(r.driverId, 'request:expired', { requestId: r.id });
    }
    this.notifyExpiredOffers(expired.offers);
    if (expired.requests.length) this.logger.log(`Expired ${expired.requests.length} request(s)`);

    for (const { request, previousRadiusKm } of await widenSearchRadius(this.db)) {
      // Only the new outer ring: providers inside the old radius were already notified.
      const newlyNotified = await dispatchRequest(this.db, this.realtime, request, { outsideKm: previousRadiusKm });
      this.realtime.emitToUser(request.driverId, 'request:widened', {
        requestId: request.id,
        searchRadiusKm: request.searchRadiusKm,
        newlyNotified,
      });
      this.logger.log(`Widened request ${request.id} to ${request.searchRadiusKm} km (${newlyNotified} notified)`);
    }
  }

  private notifyExpiredOffers(expired: ExpiredOffer[]) {
    for (const o of expired) {
      const payload = { offerId: o.id, requestId: o.requestId };
      this.realtime.emitToUser(o.driverId, 'offer:expired', payload);
      this.realtime.emitToUser(o.providerId, 'offer:expired', payload);
    }
  }
}
