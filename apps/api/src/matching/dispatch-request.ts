import type { DbExecutor } from '../db/database.module.js';
import type { requests } from '../db/schema.js';
import type { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { findMatchingProviders } from './find-matching-providers.js';
import { toNearbyRequest } from './find-nearby-requests.js';

/**
 * Finds the providers who match an open request and pushes it to each of them. Used when a request
 * is created, reopened after a cancellation, and (later) when its search radius widens.
 *
 * Call only after the request row is committed. Fire-and-forget: providers who aren't connected
 * pick it up from the nearby-requests feed when they reconnect.
 */
export async function dispatchRequest(
  db: DbExecutor,
  realtime: RealtimeGateway,
  request: typeof requests.$inferSelect,
  excludeProviderIds: string[] = [],
): Promise<number> {
  const matches = await findMatchingProviders(db, { ...request, excludeProviderIds });
  for (const match of matches) {
    realtime.emitToUser(match.providerId, 'request:new', toNearbyRequest(request, match.distanceMeters));
  }
  return matches.length;
}
