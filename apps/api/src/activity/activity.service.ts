import { Injectable } from '@nestjs/common';

/**
 * How long after the last real traffic the background sweeps keep running. It must cover every
 * deadline traffic can start: a request lives 10 min, widening can push that to ~14.5 min, offers
 * last 5, a silent vulcanizer is switched off after 2. 20 min covers them all with room to spare.
 */
export const IDLE_AFTER_MS = 20 * 60_000;

/**
 * Remembers when the API last saw real use: signed-in requests (AuthGuard), logins and session
 * refreshes (AuthService), and socket connections and live locations. Never anonymous traffic or
 * health checks, which on a public URL never stop.
 * In memory on purpose: checking it costs nothing, which is the point. Sweeps ask it before
 * touching the database, so a quiet app lets Neon suspend instead of burning free compute hours.
 */
@Injectable()
export class ActivityService {
  private lastActivityAt = Number.NEGATIVE_INFINITY; // never, whatever the clock says

  touch(now = Date.now()) {
    this.lastActivityAt = now;
  }

  isActive(now = Date.now()) {
    return now - this.lastActivityAt < IDLE_AFTER_MS;
  }
}
