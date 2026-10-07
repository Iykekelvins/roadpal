import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { ActivityService } from '../activity/activity.service.js';
import type { Env } from '../config/env.js';
import { DB, type Database } from '../db/database.module.js';
import { dispatchRequest } from '../matching/dispatch-request.js';
import { notifyWithdrawn } from '../offers/withdraw-pending-offers.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { cleanupExpiredAuthData } from './cleanup.js';
import { expireRequests, expireStaleOffers, type ExpiredOffer } from './expire.js';
import { offlineGhostProviders } from './ghosts.js';
import { widenSearchRadius } from './widen.js';

export const SWEEP_INTERVAL_MS = 30_000;
// Nothing in cleanup is time-sensitive, and its deletes scan unindexed columns: hourly is plenty.
export const CLEANUP_INTERVAL_MS = 60 * 60_000;

/**
 * Periodic, database-driven background work. Deadlines live in the rows (not in timers), so
 * nothing is lost on restart, and each sweep is safe to run on several instances at once.
 */
@Injectable()
export class SweeperService {
  private readonly logger = new Logger(SweeperService.name);
  private running = false;
  private cleaning = false;

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly realtime: RealtimeGateway,
    private readonly config: ConfigService<Env, true>,
    private readonly activity: ActivityService,
  ) {}

  private idle = false;

  /**
   * Nobody has used the app for a while: skip the database entirely so Neon can suspend. Safe,
   * because every deadline a sweep acts on falls inside the activity window (see IDLE_AFTER_MS),
   * and sweeps compare timestamps, so the first tick after traffic resumes catches up on anything due.
   */
  private shouldSkip() {
    const idle = !this.activity.isActive();
    if (idle !== this.idle) this.logger.log(idle ? 'No recent activity: pausing sweeps' : 'Activity again: resuming sweeps');
    this.idle = idle;
    return idle;
  }

  @Interval(SWEEP_INTERVAL_MS)
  async tick() {
    if (!this.config.get('SWEEPS_ENABLED', { infer: true }) || this.shouldSkip()) return;
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

  @Interval(CLEANUP_INTERVAL_MS)
  async cleanup() {
    // Not urgent: if the app is idle, this simply happens during the next active hour.
    if (!this.config.get('SWEEPS_ENABLED', { infer: true }) || this.cleaning || !this.activity.isActive()) return;
    this.cleaning = true;
    try {
      const deleted = await cleanupExpiredAuthData(this.db);
      this.logger.log(`Cleanup: ${deleted.refreshTokens} refresh token(s), ${deleted.otpCodes} OTP code(s) deleted`);
    } catch (error) {
      this.logger.error('Cleanup failed', error as Error);
    } finally {
      this.cleaning = false;
    }
  }

  async runOnce() {
    // Ghosts first: their offers are withdrawn before anything else looks at offers.
    const ghosts = await offlineGhostProviders(this.db);
    for (const providerId of ghosts.providerIds) {
      this.realtime.emitToUser(providerId, 'provider:offline', { reason: 'stale_location' });
    }
    notifyWithdrawn(this.realtime, ghosts.withdrawn);
    if (ghosts.providerIds.length) this.logger.log(`Set ${ghosts.providerIds.length} silent provider(s) offline`);

    // An offer that just went stale no longer blocks widening, and overdue requests are expired
    // before they could be widened.
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
