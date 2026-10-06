import { REFRESH_TOKEN_COOKIE, TOKEN_TRANSPORT_HEADER } from '@repo/shared';
import type { CookieOptions, Request } from 'express';
import type { Env } from '../config/env.js';
import { REFRESH_TOKEN_TTL_SECONDS } from './refresh-token.js';

/**
 * Browser clients opt in with `X-Token-Transport: cookie`: the refresh token then travels only in
 * an httpOnly cookie that JavaScript can't read, and is left out of the JSON body. Other clients
 * (tests, a future native app) keep receiving it in the body.
 */
export const wantsCookieTransport = (req: Request): boolean => req.header(TOKEN_TRANSPORT_HEADER) === 'cookie';

export const readRefreshCookie = (req: Request): string | undefined =>
  (req.cookies as Record<string, string> | undefined)?.[REFRESH_TOKEN_COOKIE];

export function refreshCookieOptions(env: Pick<Env, 'NODE_ENV' | 'REFRESH_COOKIE_PATH'>): CookieOptions {
  return {
    httpOnly: true, // unreadable from JavaScript, so an XSS bug can't steal it
    secure: env.NODE_ENV === 'production', // HTTPS only in production (localhost is plain HTTP)
    sameSite: 'strict', // never sent on requests started by other sites: blocks CSRF
    path: env.REFRESH_COOKIE_PATH, // only sent to the auth endpoints, as the browser sees them
    maxAge: REFRESH_TOKEN_TTL_SECONDS * 1000,
  };
}
