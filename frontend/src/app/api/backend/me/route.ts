import { isBetterAuthDevelopmentEnabled } from '@/lib/auth-feature-flag';

const AUTH_COOKIE_NAMES = [
  'safeguard-auth.session_token',
  '__Secure-safeguard-auth.session_token',
] as const;
const MAX_COOKIE_HEADER_LENGTH = 8_192;

function errorResponse(status: number, code: string): Response {
  return Response.json({ error: code }, { status, headers: { 'cache-control': 'no-store' } });
}

function getAuthCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader || cookieHeader.length > MAX_COOKIE_HEADER_LENGTH) return null;
  const secureName = process.env.NODE_ENV === 'production';
  const expectedName = secureName ? AUTH_COOKIE_NAMES[1] : AUTH_COOKIE_NAMES[0];
  const pairs = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${expectedName}=`));
  if (pairs.length !== 1) return null;
  const [, value] = pairs[0]!.split('=', 2);
  return value?.trim() ? pairs[0]! : null;
}

function getApiProfileUrl(): URL {
  const configured = process.env.API_URL ?? 'http://localhost:4000/api/v1';
  const base = new URL(configured);
  if (base.username || base.password || base.search || base.hash) {
    throw new Error('Invalid API_URL configuration.');
  }
  if (process.env.NODE_ENV === 'production' && base.protocol !== 'https:') {
    throw new Error('API_URL must use HTTPS in production.');
  }
  base.pathname = `${base.pathname.replace(/\/$/, '')}/internal/me`;
  return base;
}

function getAllowedWebOrigins(): Set<string> {
  const configured = new URL(process.env.WEB_ORIGIN ?? 'http://localhost:3000');
  const origins = new Set([configured.origin]);
  if (configured.protocol === 'http:' && configured.port === '3000') {
    if (configured.hostname === 'localhost') {
      origins.add(new URL(`http://127.0.0.1:3000`).origin);
    } else if (configured.hostname === '127.0.0.1') {
      origins.add(new URL(`http://localhost:3000`).origin);
    }
  }
  return origins;
}

export async function GET(request: Request): Promise<Response> {
  if (!isBetterAuthDevelopmentEnabled()) return errorResponse(404, 'not_found');

  const allowedOrigins = getAllowedWebOrigins();
  const requestUrl = new URL(request.url);
  const hostHeader = request.headers.get('host');
  let requestOrigin = requestUrl.origin;
  if (hostHeader !== null) {
    const matchingOrigin = [...allowedOrigins].find(
      (origin) => new URL(origin).host.toLowerCase() === hostHeader.toLowerCase(),
    );
    if (!matchingOrigin) {
      return errorResponse(403, 'origin_rejected');
    }
    requestOrigin = matchingOrigin;
  }
  const originHeader = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  if (
    !allowedOrigins.has(requestOrigin) ||
    (originHeader !== null && (originHeader === 'null' || originHeader !== requestOrigin)) ||
    (fetchSite !== null && fetchSite !== 'same-origin' && fetchSite !== 'none')
  ) {
    return errorResponse(403, 'origin_rejected');
  }

  const authCookie = getAuthCookie(request.headers.get('cookie'));
  if (!authCookie) return errorResponse(401, 'unauthorized');

  let apiUrl: URL;
  try {
    apiUrl = getApiProfileUrl();
  } catch {
    return errorResponse(503, 'api_unavailable');
  }

  try {
    const upstream = await fetch(apiUrl, {
      method: 'GET',
      headers: { accept: 'application/json', cookie: authCookie },
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(5_000),
    });

    if (upstream.status === 401) return errorResponse(401, 'unauthorized');
    if (upstream.status === 403) return errorResponse(403, 'not_authorized');
    if (!upstream.ok) return errorResponse(502, 'api_unavailable');
    if (!upstream.headers.get('content-type')?.toLowerCase().includes('application/json')) {
      return errorResponse(502, 'api_unavailable');
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch {
    return errorResponse(502, 'api_unavailable');
  }
}
