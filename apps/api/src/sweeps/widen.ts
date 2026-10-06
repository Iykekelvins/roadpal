import {
  MAX_SEARCH_RADIUS_KM,
  WIDEN_AFTER_MINUTES,
  WIDEN_MIN_REMAINING_MINUTES,
} from '@repo/shared';
import { inArray, sql } from 'drizzle-orm';
import type { DbExecutor } from '../db/database.module.js';
import { requests } from '../db/schema.js';

export interface WidenedRequest {
  request: typeof requests.$inferSelect;
  previousRadiusKm: number;
}

/**
 * Open requests with no pending offers, last dispatched WIDEN_AFTER_MINUTES ago: double the search
 * radius (capped), extend the deadline so newly reached providers have time, and report the old
 * radius so only the new outer ring gets notified.
 */
export async function widenSearchRadius(db: DbExecutor): Promise<WidenedRequest[]> {
  // RETURNING only sees the updated row, so the CTE captures the old radius first. FOR UPDATE
  // SKIP LOCKED: rows another sweep (another instance) is already widening are skipped, not waited
  // on, so each request is widened once per round no matter how many instances run this.
  const result = await db.execute<{ id: string; previous_radius_km: number }>(sql`
    with due as (
      select r.id, r.search_radius_km as previous_radius_km
      from requests r
      where r.status = 'open'
        and r.expires_at > now()
        and r.search_radius_km < ${MAX_SEARCH_RADIUS_KM}
        and r.last_dispatched_at <= now() - make_interval(mins => ${WIDEN_AFTER_MINUTES})
        and not exists (select 1 from offers o where o.request_id = r.id and o.status = 'pending')
      for update of r skip locked
    )
    update requests
    set search_radius_km = least(requests.search_radius_km * 2, ${MAX_SEARCH_RADIUS_KM}),
        last_dispatched_at = now(),
        expires_at = greatest(requests.expires_at, now() + make_interval(mins => ${WIDEN_MIN_REMAINING_MINUTES}))
    from due
    where requests.id = due.id
    returning requests.id, due.previous_radius_km
  `);
  if (!result.rows.length) return [];

  // Re-read through Drizzle to get properly typed rows (e.g. the geography column decoded).
  const previousRadius = new Map(result.rows.map((r) => [r.id, Number(r.previous_radius_km)]));
  const rows = await db.select().from(requests).where(inArray(requests.id, [...previousRadius.keys()]));
  return rows.map((request) => ({ request, previousRadiusKm: previousRadius.get(request.id)! }));
}
