import { TOKEN_TRANSPORT_HEADER } from "@repo/shared";

/**
 * Browser API client.
 * - Calls go to /api/* on this site (proxied to the API by next.config.ts).
 * - The access token lives only in memory (this module), never in localStorage.
 * - The refresh token is an httpOnly cookie the API sets; JavaScript can't read it, and the
 *   browser sends it automatically to /api/auth/*.
 * - A 401 triggers one refresh and one retry.
 */

let accessToken: string | null = null;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Machine-readable code from the API, e.g. "ROLE_REQUIRED". */
    readonly code?: string,
    /** Per-field validation messages, e.g. { phone: ["Enter a valid Nigerian mobile number"] }. */
    readonly fieldErrors?: Record<string, string[]>,
    /** On 429s: how long until trying again can work. */
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

/** When the network itself fails (no signal), as opposed to the API answering with an error. */
export class NetworkError extends Error {}

async function send(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  headers.set(TOKEN_TRANSPORT_HEADER, "cookie");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  try {
    return await fetch(`/api${path}`, { ...init, headers, credentials: "same-origin" });
  } catch {
    throw new NetworkError("No connection. Check your signal and try again.");
  }
}

async function toError(res: Response): Promise<ApiError> {
  const body = await res.json().catch(() => ({}));
  const message = Array.isArray(body.message) ? body.message.join(", ") : (body.message ?? "Something went wrong");
  return new ApiError(res.status, message, body.code, body.errors, body.retryAfterSeconds);
}

export interface Session {
  accessToken: string;
  accessTokenExpiresIn: number;
}

// Single flight: if several requests hit 401 at once, they share ONE refresh instead of each
// rotating the token (which would look like token reuse to the API).
let refreshing: Promise<Session | null> | null = null;

/** Gets a fresh access token from the refresh cookie. Resolves to null if there's no valid session. */
export function refreshSession(): Promise<Session | null> {
  refreshing ??= (async () => {
    try {
      const res = await send("/auth/refresh", { method: "POST", body: "{}" });
      if (!res.ok) {
        accessToken = null;
        return null;
      }
      const session = (await res.json()) as Session;
      accessToken = session.accessToken;
      return session;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/** JSON request to the API. Throws ApiError (API said no) or NetworkError (no connection). */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res = await send(path, init);
  if (res.status === 401 && !path.startsWith("/auth/") && (await refreshSession())) {
    res = await send(path, init);
  }
  if (!res.ok) throw await toError(res);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

/**
 * A message to show for any caught error. API and connection errors already read well; anything
 * else is a bug, so it's logged, and in development its real message is shown instead of hidden.
 */
export function describeError(error: unknown, fallback = "Something went wrong. Try again."): string {
  if (error instanceof ApiError || error instanceof NetworkError) return error.message;
  console.error(error);
  return process.env.NODE_ENV === "development" && error instanceof Error ? `${fallback} (${error.message})` : fallback;
}
