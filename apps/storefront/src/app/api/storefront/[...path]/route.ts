import { NextResponse, type NextRequest } from 'next/server';

/**
 * Same-origin proxy to the storefront API.
 *
 * Two problems this solves, both of which only bite client components:
 *
 *  1. **CORS.** The API's allowlist matches bare `localhost`/`127.0.0.1` in
 *     development, not the `<tenant>.ems.localhost` subdomains a storefront is
 *     actually served from. A `fetch()` straight from the browser to the API is
 *     therefore a preflight failure on every tenant host. Routing through the
 *     storefront's own origin means there is no cross-origin request to allow.
 *
 *  2. **The hostname contract.** The API resolves the tenant from the hostname,
 *     and `Host` is a header `fetch` refuses to set. Forwarding it as
 *     `x-ems-hostname` has to happen on *every* call, so it happens here — once —
 *     rather than being a rule each call site has to remember and one of them
 *     eventually forgets.
 *
 * Server components do not need this and should keep calling `storefrontFetch()`
 * directly: server-to-server has no origin to check, and an extra hop through
 * this handler would only add latency to the initial render.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/**
 * Request headers worth passing through. An allowlist rather than a blind copy:
 * forwarding `host` would defeat the tenant resolution this proxy exists to fix,
 * and forwarding hop-by-hop headers (`connection`, `content-length`) at a
 * protocol boundary produces requests that are subtly malformed.
 */
const FORWARDED_REQUEST_HEADERS = ['content-type', 'accept', 'idempotency-key', 'accept-language'] as const;

async function proxy(request: NextRequest, path: string[]): Promise<Response> {
  // The middleware has already normalised this off the incoming `Host`. Falling
  // back to `host` keeps the handler working if the matcher ever stops covering
  // `/api`, which would otherwise fail as a silent tenant-less request.
  const hostname =
    request.headers.get('x-ems-hostname') ?? (request.headers.get('host') ?? '').split(':')[0]!.toLowerCase();

  const search = request.nextUrl.search;
  const target = `${API_BASE}/storefront/${path.map(encodeURIComponent).join('/')}${search}`;

  const headers = new Headers({ 'x-ems-hostname': hostname, Accept: 'application/json' });
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  // Read the body as text rather than streaming it: a duplex stream body requires
  // HTTP/2 to the upstream, and these payloads are small JSON documents.
  const method = request.method;
  const body = method === 'GET' || method === 'HEAD' ? undefined : await request.text();

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method,
      headers,
      body: body || undefined,
      // The API is the source of truth for cart and checkout state; a cached
      // response here would show a shopper a cart they have already changed.
      cache: 'no-store',
    });
  } catch {
    // A dead upstream is a 502, not a 500: the failure is not in this handler, and
    // the client's retry policy should treat it as transient.
    return NextResponse.json(
      {
        success: false,
        error: { code: 'UPSTREAM_UNAVAILABLE', message: 'The store API could not be reached.' },
      },
      { status: 502 },
    );
  }

  // 204 has no body by definition, and constructing a Response with one throws.
  if (upstream.status === 204) return new NextResponse(null, { status: 204 });

  const text = await upstream.text();

  // Passed through verbatim so the client sees the API's own envelope and error
  // codes. Re-shaping errors here would mean maintaining a second error contract.
  return new NextResponse(text, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  });
}

type Context = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, context: Context): Promise<Response> {
  return proxy(request, (await context.params).path);
}

export async function POST(request: NextRequest, context: Context): Promise<Response> {
  return proxy(request, (await context.params).path);
}

export async function PUT(request: NextRequest, context: Context): Promise<Response> {
  return proxy(request, (await context.params).path);
}

export async function PATCH(request: NextRequest, context: Context): Promise<Response> {
  return proxy(request, (await context.params).path);
}

export async function DELETE(request: NextRequest, context: Context): Promise<Response> {
  return proxy(request, (await context.params).path);
}
