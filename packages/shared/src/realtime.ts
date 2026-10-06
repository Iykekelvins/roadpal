// Socket.IO event contracts, imported by both the API and the web app so names and payloads can't drift.

/** Events the server pushes to clients. */
export interface ServerToClientEvents {
  /** The access token used for this socket expired; refresh it and reconnect. */
  'session:expired': () => void;
}

/** Events clients send to the server (none yet: client actions go over REST). */
export type ClientToServerEvents = Record<string, never>;

/** Error message sent with connect_error when the handshake token is missing or invalid. */
export const SOCKET_UNAUTHORIZED = 'UNAUTHORIZED';
