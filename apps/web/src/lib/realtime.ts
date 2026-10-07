import type { ClientToServerEvents, ServerToClientEvents } from "@repo/shared";
import { io, type Socket } from "socket.io-client";
import { getAccessToken } from "./api";

// Sockets go straight to the API, not through the /api proxy: WebSockets don't pass through Next
// rewrites reliably (and not at all on Vercel). That's safe because the socket authenticates with
// the access token in the handshake, not with a cookie.
// Trimmed: a stray space pasted into the dashboard turns the host into "%20https" and every
// live connection silently fails (it happened on the first production deploy).
const SOCKET_URL = (process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:8000").trim();

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function createSocket(): AppSocket {
  return io(SOCKET_URL, {
    // A function, not a value: it runs on every (re)connect, so a refreshed token is picked up.
    auth: (cb) => cb({ token: getAccessToken() }),
    autoConnect: false,
  });
}
