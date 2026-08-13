import type { CookieOptions } from 'express';

export const REFRESH_COOKIE_NAME = 'ems_refresh';

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Refresh-token cookie options.
 *
 * Each flag defends against a specific attack:
 *
 *  - `httpOnly` — JavaScript cannot read it, so an XSS payload or a compromised
 *    dependency cannot exfiltrate a 30-day credential. This is the single most
 *    important reason the refresh token is a cookie and not a response field.
 *  - `secure` — never sent over plain HTTP. Disabled in development because
 *    `localhost` is served over HTTP and the cookie would otherwise be dropped
 *    silently, which looks like a broken login.
 *  - `sameSite: 'strict'` — the cookie is not attached to cross-site requests, so a
 *    hostile page cannot trigger a token refresh on the victim's behalf. Strict rather
 *    than `lax` is affordable here because `/auth/refresh` is only ever called by our
 *    own first-party script, never by following a link.
 *  - `path: '/api/v1/auth'` — narrows the cookie to the only routes that need it, so it
 *    is not attached to every product and order request.
 */
export function buildRefreshCookieOptions(expiresAt: Date): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/api/v1/auth',
    expires: expiresAt,
    // Also set maxAge: some clients honour one and not the other.
    maxAge: Math.max(0, expiresAt.getTime() - Date.now()),
  };
}

/**
 * Options for clearing the cookie.
 *
 * Must mirror `path` and `sameSite` exactly — a browser will not remove a cookie whose
 * attributes do not match, so a mismatch leaves a dead token in place and every page
 * load retries a refresh that can never succeed.
 */
export function clearRefreshCookie(): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/api/v1/auth',
  };
}
