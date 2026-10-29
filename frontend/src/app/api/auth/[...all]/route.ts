import { isBetterAuthDevelopmentEnabled } from "@/lib/auth-feature-flag";

type Context = { params: Promise<{ all: string[] }> };
const MAX_BODY_BYTES = 65_536;

function reject(status: number): Response {
  return new Response(null, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

async function forward(request: Request, context: Context): Promise<Response> {
  if (!isBetterAuthDevelopmentEnabled()) return reject(404);
  const origin = new URL(process.env.WEB_ORIGIN ?? "http://localhost:3000")
    .origin;
  const url = new URL(request.url);
  const host = request.headers.get("host");
  if (
    (host
      ? host.toLowerCase() !== new URL(origin).host.toLowerCase()
      : url.origin !== origin) ||
    (request.headers.get("origin") && request.headers.get("origin") !== origin)
  )
    return reject(403);
  if (
    request.headers.get("sec-fetch-site") &&
    !["same-origin", "none"].includes(request.headers.get("sec-fetch-site")!)
  )
    return reject(403);
  if (request.method !== "GET" && request.headers.get("origin") !== origin)
    return reject(403);

  const { all } = await context.params;
  if (!all.length || all.some((segment) => !/^[a-zA-Z0-9_-]+$/.test(segment)))
    return reject(404);
  let upstreamUrl: URL;
  try {
    const base = new URL(process.env.AUTH_API_URL ?? "http://localhost:4000");
    if (
      base.username ||
      base.password ||
      base.search ||
      base.hash ||
      base.pathname !== "/" ||
      (process.env.NODE_ENV === "production" && base.protocol !== "https:")
    )
      return reject(503);
    upstreamUrl = new URL(`/api/auth/${all.join("/")}${url.search}`, base);
  } catch {
    return reject(503);
  }

  const headers = new Headers({
    origin,
    accept: request.headers.get("accept") ?? "application/json",
  });
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  let body: ArrayBuffer | undefined;
  if (request.method !== "GET") {
    if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES)
      return reject(413);
    body = await request.arrayBuffer();
    if (body.byteLength > MAX_BODY_BYTES) return reject(413);
  }

  try {
    const upstream = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      ...(body ? { body } : {}),
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(8_000),
    });
    const responseHeaders = new Headers({
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    });
    const responseType = upstream.headers.get("content-type");
    if (responseType) responseHeaders.set("content-type", responseType);
    for (const value of upstream.headers.getSetCookie())
      responseHeaders.append("set-cookie", value);
    const location = upstream.headers.get("location");
    if (location) {
      const target = new URL(location, origin);
      if (target.origin !== origin) return reject(502);
      responseHeaders.set("location", target.href);
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError")
      return reject(504);
    return reject(502);
  }
}

export const GET = forward;
export const POST = forward;
