import { isBetterAuthDevelopmentEnabled } from '@/lib/auth-feature-flag';

const AUTH_COOKIE_NAMES = [
  'safeguard-auth.session_token',
  '__Secure-safeguard-auth.session_token',
] as const;
const MAX_COOKIE_HEADER_LENGTH = 8_192;
const MAX_BODY_BYTES = 32_768;
type RouteContext = { params: Promise<{ segments: string[] }> };
type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

function errorResponse(status: number, code: string): Response {
  return Response.json({ error: code }, { status, headers: { 'cache-control': 'no-store' } });
}

function getAuthCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader || cookieHeader.length > MAX_COOKIE_HEADER_LENGTH) return null;
  const expectedName =
    process.env.NODE_ENV === 'production' ? AUTH_COOKIE_NAMES[1] : AUTH_COOKIE_NAMES[0];
  const pairs = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${expectedName}=`));
  return pairs.length === 1 && pairs[0]!.split('=', 2)[1]?.trim() ? pairs[0]! : null;
}

function isAllowedRoute(path: string, method: HttpMethod): boolean {
  const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
  const rules: Array<[RegExp, HttpMethod[]]> = [
    [/^owners$/, ['GET']],
    [/^inquiries$/, ['GET', 'POST']],
    [new RegExp(`^inquiries/${uuid}$`, 'i'), ['GET', 'PATCH']],
    [/^companies$/, ['GET', 'POST']],
    [new RegExp(`^companies/${uuid}$`, 'i'), ['GET', 'PATCH', 'DELETE']],
    [new RegExp(`^companies/${uuid}/contacts$`, 'i'), ['GET', 'POST']],
    [new RegExp(`^contacts/${uuid}$`, 'i'), ['GET', 'PATCH', 'DELETE']],
    [/^opportunities$/, ['GET', 'POST']],
    [new RegExp(`^opportunities/${uuid}$`, 'i'), ['GET', 'PATCH', 'DELETE']],
    [/^activities$/, ['GET', 'POST']],
    [new RegExp(`^activities/${uuid}$`, 'i'), ['GET', 'PATCH']],
  ];
  return rules.some(([pattern, methods]) => pattern.test(path) && methods.includes(method));
}

function allowedRequestOrigin(request: Request): boolean {
  try {
    const configured = new URL(process.env.WEB_ORIGIN ?? 'http://localhost:3000');
    const origins = new Set([configured.origin]);
    if (configured.protocol === 'http:' && configured.port === '3000') {
      if (configured.hostname === 'localhost') origins.add('http://127.0.0.1:3000');
      if (configured.hostname === '127.0.0.1') origins.add('http://localhost:3000');
    }
    const url = new URL(request.url);
    const host = request.headers.get('host');
    const requestOrigin = host
      ? [...origins].find((origin) => new URL(origin).host.toLowerCase() === host.toLowerCase())
      : url.origin;
    const origin = request.headers.get('origin');
    const fetchSite = request.headers.get('sec-fetch-site');
    return Boolean(
      requestOrigin &&
      origins.has(requestOrigin) &&
      (origin === null || (origin !== 'null' && origin === requestOrigin)) &&
      (fetchSite === null || fetchSite === 'same-origin' || fetchSite === 'none'),
    );
  } catch {
    return false;
  }
}

async function readBoundedBody(request: Request): Promise<ArrayBuffer | null> {
  const reader = request.body?.getReader();
  if (!reader) return new ArrayBuffer(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body.buffer;
}

async function handle(
  request: Request,
  context: RouteContext,
  method: HttpMethod,
): Promise<Response> {
  if (!isBetterAuthDevelopmentEnabled()) return errorResponse(404, 'not_found');
  if (!allowedRequestOrigin(request)) return errorResponse(403, 'origin_rejected');
  if (method !== 'GET' && !request.headers.get('origin'))
    return errorResponse(403, 'origin_rejected');
  const cookie = getAuthCookie(request.headers.get('cookie'));
  if (!cookie) return errorResponse(401, 'unauthorized');

  const { segments } = await context.params;
  const path = segments.join('/');
  if (!isAllowedRoute(path, method)) return errorResponse(404, 'not_found');

  let apiUrl: URL;
  try {
    const base = new URL(process.env.API_URL ?? 'http://localhost:4000/api/v1');
    if (base.username || base.password || base.search || base.hash)
      throw new Error('Invalid API URL.');
    if (process.env.NODE_ENV === 'production' && base.protocol !== 'https:')
      throw new Error('HTTPS required.');
    base.pathname = `${base.pathname.replace(/\/$/, '')}/crm/${path}`;
    base.search = new URL(request.url).search;
    apiUrl = base;
  } catch {
    return errorResponse(503, 'api_unavailable');
  }

  const headers = new Headers({ accept: 'application/json', cookie });
  let body: ArrayBuffer | undefined;
  if (method === 'POST' || method === 'PATCH') {
    const mediaType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
    if (mediaType !== 'application/json') {
      return errorResponse(415, 'unsupported_media_type');
    }
    const declaredSize = Number(request.headers.get('content-length') ?? 0);
    if (declaredSize > MAX_BODY_BYTES) return errorResponse(413, 'payload_too_large');
    const boundedBody = await readBoundedBody(request);
    if (boundedBody === null) return errorResponse(413, 'payload_too_large');
    body = boundedBody;
    headers.set('content-type', 'application/json');
  }

  try {
    const upstream = await fetch(apiUrl, {
      method,
      headers,
      ...(body ? { body } : {}),
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(8_000),
    });
    if (upstream.status >= 300 && upstream.status < 400)
      return errorResponse(502, 'api_unavailable');
    if (upstream.status === 204)
      return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
    const contentType = upstream.headers.get('content-type')?.toLowerCase() ?? '';
    if (!contentType.includes('application/json')) return errorResponse(502, 'api_unavailable');
    return new Response(upstream.body, {
      status: upstream.status,
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

export const GET = (request: Request, context: RouteContext) => handle(request, context, 'GET');
export const POST = (request: Request, context: RouteContext) => handle(request, context, 'POST');
export const PATCH = (request: Request, context: RouteContext) => handle(request, context, 'PATCH');
export const DELETE = (request: Request, context: RouteContext) =>
  handle(request, context, 'DELETE');
