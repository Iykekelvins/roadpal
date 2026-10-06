import { eq } from 'drizzle-orm';
import type { DbExecutor } from '../db/database.module.js';
import { jobs, type requests } from '../db/schema.js';
import type { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { findMatchingProviders } from './find-matching-providers.js';
import { toNearbyRequest } from './find-nearby-requests.js';

/**
 * Finds the providers who match an open request and pushes it to each of them. Used when a request
 * is created, reopened after a cancellation, and when its search radius widens.
 *
 * Providers who already had a job on this request (cancelled or no-showed) are always left out:
 * their accepted offer blocks them from offering again anyway.
 *
 * Call only after the request row is committed. Fire-and-forget: providers who aren't connected
 * pick it up from the nearby-requests feed when they reconnect.
 */
export async function dispatchRequest(
  db: DbExecutor,
  realtime: RealtimeGateway,
  request: typeof requests.$inferSelect,
  options: { outsideKm?: number } = {},
): Promise<number> {
  const previous = await db.select({ providerId: jobs.providerId }).from(jobs).where(eq(jobs.requestId, request.id));
  const matches = await findMatchingProviders(db, {
    ...request,
    excludeProviderIds: previous.map((p) => p.providerId),
    outsideKm: options.outsideKm,
  });
  for (const match of matches) {
    realtime.emitToUser(match.providerId, 'request:new', toNearbyRequest(request, match.distanceMeters));
  }
  return matches.length;
}
