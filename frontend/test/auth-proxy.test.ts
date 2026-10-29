import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { GET, POST } from "../src/app/api/auth/[...all]/route.js";

const originalFetch = globalThis.fetch;
const keys = [
  "NODE_ENV",
  "BETTER_AUTH_DEV_ENABLED",
  "BETTER_AUTH_SCHEMA_READY",
  "WEB_ORIGIN",
  "AUTH_API_URL",
] as const;
const saved = keys.map((key) => [key, process.env[key]] as const);
const context = { params: Promise.resolve({ all: ["get-session"] }) };

before(() => {
  Object.assign(process.env, { NODE_ENV: "development" });
  process.env.BETTER_AUTH_DEV_ENABLED = "true";
  process.env.BETTER_AUTH_SCHEMA_READY = "true";
  process.env.WEB_ORIGIN = "http://localhost:3000";
  process.env.AUTH_API_URL = "http://localhost:4000";
});
after(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of saved) {
    if (value === undefined) Reflect.deleteProperty(process.env, key);
    else Object.assign(process.env, { [key]: value });
  }
});

test("same-origin proxy retains auth cookies and multi-value Set-Cookie without forwarding forged headers", async () => {
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "http://localhost:4000/api/auth/get-session");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("cookie"), "safeguard-auth.session_token=opaque");
    assert.equal(headers.get("authorization"), null);
    assert.equal(headers.get("x-forwarded-host"), null);
    assert.equal(headers.get("origin"), "http://localhost:3000");
    const responseHeaders = new Headers();
    responseHeaders.append(
      "set-cookie",
      "safeguard-auth.session_token=new; HttpOnly; SameSite=Lax",
    );
    responseHeaders.append(
      "set-cookie",
      "safeguard-auth.two_factor=code; HttpOnly; SameSite=Lax",
    );
    return Response.json({ session: null }, { headers: responseHeaders });
  };
  const response = await GET(
    new Request("http://localhost:3000/api/auth/get-session", {
      headers: {
        cookie: "safeguard-auth.session_token=opaque",
        authorization: "Bearer forged",
        "x-forwarded-host": "evil.test",
      },
    }),
    context,
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.getSetCookie().length, 2);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("auth proxy enforces same-origin writes and blocks external redirects", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(null, {
      status: 302,
      headers: { location: "https://evil.test/" },
    });
  };
  const write = (origin?: string) =>
    new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: origin
        ? { origin, "content-type": "application/json" }
        : { "content-type": "application/json" },
      body: "{}",
    });
  const signIn = { params: Promise.resolve({ all: ["sign-in", "email"] }) };
  assert.equal((await POST(write(), signIn)).status, 403);
  assert.equal((await POST(write("https://evil.test"), signIn)).status, 403);
  assert.equal(calls, 0);
  assert.equal(
    (await POST(write("http://localhost:3000"), signIn)).status,
    502,
  );
  assert.equal(calls, 1);
});

test("sign-out proxy preserves upstream failures and maps transport timeouts explicitly", async () => {
  const signOutContext = { params: Promise.resolve({ all: ["sign-out"] }) };
  const request = () =>
    new Request("http://localhost:3000/api/auth/sign-out", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        "content-type": "application/json",
      },
      body: "{}",
    });
  globalThis.fetch = async (input) => {
    assert.equal(String(input), "http://localhost:4000/api/auth/sign-out");
    return Response.json({ code: "DATABASE_UNAVAILABLE" }, { status: 500 });
  };
  const upstreamFailure = await POST(request(), signOutContext);
  assert.equal(upstreamFailure.status, 500);
  assert.deepEqual(await upstreamFailure.json(), {
    code: "DATABASE_UNAVAILABLE",
  });

  globalThis.fetch = async () => {
    throw Object.assign(new Error("timeout"), { name: "TimeoutError" });
  };
  assert.equal((await POST(request(), signOutContext)).status, 504);
});
