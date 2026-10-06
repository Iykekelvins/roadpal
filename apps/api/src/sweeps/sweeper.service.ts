import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import type { Env } from '../config/env.js';
import { DB, type Database } from '../db/database.module.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { expireRequests, expireStaleOffers, type ExpiredOffer } from './expire.js';

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
    const expired = await expireRequests(this.db);
    for (const r of expired.requests) {
      this.realtime.emitToUser(r.driverId, 'request:expired', { requestId: r.id });
    }
    this.notifyExpiredOffers(expired.offers);

    this.notifyExpiredOffers(await expireStaleOffers(this.db));

    if (expired.requests.length) this.logger.log(`Expired ${expired.requests.length} request(s)`);
  }

  private notifyExpiredOffers(expired: ExpiredOffer[]) {
    for (const o of expired) {
      const payload = { offerId: o.id, requestId: o.requestId };
      this.realtime.emitToUser(o.driverId, 'offer:expired', payload);
      this.realtime.emitToUser(o.providerId, 'offer:expired', payload);
    }
  }
}
