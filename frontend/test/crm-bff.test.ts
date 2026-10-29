import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { DELETE, GET, PATCH, POST } from '../src/app/api/backend/crm/[...segments]/route.js';

const envKeys = [
  'NODE_ENV',
  'BETTER_AUTH_DEV_ENABLED',
  'BETTER_AUTH_SCHEMA_READY',
  'WEB_ORIGIN',
  'API_URL',
] as const;
const savedEnv = new Map(envKeys.map((key) => [key, process.env[key]]));
const originalFetch = globalThis.fetch;
const cookie = 'safeguard-auth.session_token=opaque';
const context = (...segments: string[]) => ({ params: Promise.resolve({ segments }) });

before(() => {
  Object.assign(process.env, { NODE_ENV: 'development' });
  process.env.BETTER_AUTH_DEV_ENABLED = 'true';
  process.env.BETTER_AUTH_SCHEMA_READY = 'true';
  process.env.WEB_ORIGIN = 'http://localhost:3000';
  process.env.API_URL = 'http://127.0.0.1:4000/api/v1';
});

after(() => {
  globalThis.fetch = originalFetch;
  for (const key of envKeys) {
    const value = savedEnv.get(key);
    if (value === undefined) Reflect.deleteProperty(process.env, key);
    else Object.assign(process.env, { [key]: value });
  }
});

test('CRM BFF requires a valid session cookie and never proxies a public route', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return Response.json({ items: [] });
  };
  const missing = await GET(
    new Request('http://localhost:3000/api/backend/crm/companies'),
    context('companies'),
  );
  assert.equal(missing.status, 401);
  const publicPost = await POST(
    new Request('http://localhost:3000/api/backend/crm/request-quote', {
      method: 'POST',
      headers: { cookie, origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: '{}',
    }),
    context('request-quote'),
  );
  assert.equal(publicPost.status, 404);
  assert.equal(calls, 0);
});

test('CRM BFF enforces origin on writes and proxies only the fixed CRM path with the session cookie', async () => {
  let destination = '';
  let forwarded: Headers | undefined;
  let method = '';
  let body = '';
  globalThis.fetch = async (input, init) => {
    destination = input.toString();
    forwarded = new Headers(init?.headers);
    method = init?.method ?? '';
    body =
      init?.body instanceof ArrayBuffer
        ? new TextDecoder().decode(init.body)
        : String(init?.body ?? '');
    return Response.json({ id: 'test-id' }, { status: 201 });
  };
  const denied = await POST(
    new Request('http://localhost:3000/api/backend/crm/companies', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: '{}',
    }),
    context('companies'),
  );
  assert.equal(denied.status, 403);

  const payload = JSON.stringify({ name: 'Acme Test' });
  const response = await POST(
    new Request('http://localhost:3000/api/backend/crm/companies?source=manual', {
      method: 'POST',
      headers: {
        cookie,
        origin: 'http://localhost:3000',
        'content-type': 'application/json',
        'x-user-role': 'ADMIN',
      },
      body: payload,
    }),
    context('companies'),
  );
  assert.equal(response.status, 201);
  assert.equal(destination, 'http://127.0.0.1:4000/api/v1/crm/companies?source=manual');
  assert.equal(method, 'POST');
  assert.equal(body, payload);
  assert.equal(forwarded?.get('cookie'), cookie);
  assert.equal(forwarded?.get('x-user-role'), null);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('CRM BFF restricts routes/methods, bounds bodies and supports internal PATCH/DELETE only', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return Response.json({ ok: true });
  };
  const uuid = 'b6b438bb-d984-4ad5-9c8a-4a9260bd31a0';
  const malformed = await PATCH(
    new Request(`http://localhost:3000/api/backend/crm/companies/not-a-uuid`, {
      method: 'PATCH',
      headers: { cookie, origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: '{}',
    }),
    context('companies', 'not-a-uuid'),
  );
  assert.equal(malformed.status, 404);
  const huge = await POST(
    new Request('http://localhost:3000/api/backend/crm/inquiries', {
      method: 'POST',
      headers: { cookie, origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'x'.repeat(33_000) }),
    }),
    context('inquiries'),
  );
  assert.equal(huge.status, 413);
  const patched = await PATCH(
    new Request(`http://localhost:3000/api/backend/crm/companies/${uuid}`, {
      method: 'PATCH',
      headers: { cookie, origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: '{}',
    }),
    context('companies', uuid),
  );
  assert.equal(patched.status, 200);
  const deleted = await DELETE(
    new Request(`http://localhost:3000/api/backend/crm/companies/${uuid}`, {
      method: 'DELETE',
      headers: { cookie, origin: 'http://localhost:3000' },
    }),
    context('companies', uuid),
  );
  assert.equal(deleted.status, 200);
  assert.equal(calls, 2);
});
