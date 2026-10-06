// Socket.IO event contracts, imported by both the API and the web app so names and payloads can't drift.
//
// Delivery rule: pushes only reach connected clients. On every (re)connect, clients refetch the REST
// view (e.g. GET /providers/me/nearby-requests) and de-duplicate by id.

import type { IssueType, VehicleType } from './enums';
import type { LatLng } from './geo';
import type { JobView } from './jobs';
import type { OfferView } from './offers';

/** A request as a provider sees it before acceptance: distance, never the driver's exact location. */
export interface NearbyRequest {
  id: string;
  vehicleType: VehicleType;
  issueType: IssueType;
  note: string | null;
  distanceMeters: number;
  createdAt: string; // ISO 8601
  expiresAt: string; // ISO 8601
}

/** Events the server pushes to clients. */
export interface ServerToClientEvents {
  /** The access token used for this socket expired; refresh it and reconnect. */
  'session:expired': () => void;
  /** A new request matched this provider. Same shape as an item in the nearby-requests feed. */
  'request:new': (request: NearbyRequest) => void;
  /** A provider made an offer on the driver's request. */
  'offer:new': (offer: OfferView) => void;
  /** To the winning provider: the driver accepted their offer. Includes exact location and phone. */
  'offer:accepted': (job: JobView) => void;
  /** To other providers on the request: the driver chose someone else. */
  'offer:rejected': (payload: { offerId: string; requestId: string }) => void;
  /** To a driver: a provider's offer was withdrawn because they took another job. */
  'offer:withdrawn': (payload: { offerId: string; requestId: string }) => void;
  /** To the driver and the provider: an offer expired before it was accepted. */
  'offer:expired': (payload: { offerId: string; requestId: string }) => void;
  /** To the driver: their request got no accepted offer in time. */
  'request:expired': (payload: { requestId: string }) => void;
  /** To the driver: no offers yet, so the search widened and more providers were notified. */
  'request:widened': (payload: { requestId: string; searchRadiusKm: number; newlyNotified: number }) => void;
  /** To a provider the server set offline (no location for too long). Their pending offers were withdrawn. */
  'provider:offline': (payload: { reason: 'stale_location' }) => void;
  /** To both participants: the job's status changed. */
  'job:updated': (job: JobView) => void;
  /** To the driver while their job is en route: the provider's latest position. */
  'job:location': (payload: { jobId: string; location: LatLng; at: string }) => void;
}

/** The server's reply (Socket.IO acknowledgement) to a live location update. */
export type LocationAck = { accepted: boolean } | { error: 'INVALID_LOCATION' | 'NOT_ALLOWED' | 'SERVER_ERROR' };

/** Events clients send to the server. Actions still go over REST; only high-frequency data comes this way. */
export interface ClientToServerEvents {
  /** Provider's position, sent every EN_ROUTE_LOCATION_INTERVAL_SECONDS while on a job. */
  'location:update': (location: LatLng, ack: (result: LocationAck) => void) => void;
}

/** Error message sent with connect_error when the handshake token is missing or invalid. */
export const SOCKET_UNAUTHORIZED = 'UNAUTHORIZED';
