import { API, DEMO_PASSWORD } from './config.mjs';

const tokenCache = new Map();

/** Raw HTTP call against the EMS API. Never throws on non-2xx; returns {status, body, headers}. */
export async function call(method, path, { token, body, headers = {}, host, raw } = {}) {
  const h = { Accept: 'application/json', ...headers };
  if (body !== undefined) h['Content-Type'] = 'application/json';
  if (token) h.Authorization = `Bearer ${token}`;
  if (host) h['x-ems-hostname'] = host;
  const res = await fetch(raw ? path : `${API}${path}`, {
    method,
    headers: h,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = undefined; }
  return { status: res.status, body: json, text, headers: res.headers };
}

/** Log in once per email and cache the access token (avoids tripping the 5-failure lockout). */
export async function login(email, password = DEMO_PASSWORD) {
  if (tokenCache.has(email)) return tokenCache.get(email);
  const r = await call('POST', '/auth/login', { body: { email, password } });
  if (r.status !== 200 || !r.body?.data?.accessToken) {
    throw new Error(`login failed for ${email}: HTTP ${r.status}`);
  }
  tokenCache.set(email, r.body.data.accessToken);
  return r.body.data.accessToken;
}

export function decodeJwt(token) {
  const [, payload] = token.split('.');
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
}
