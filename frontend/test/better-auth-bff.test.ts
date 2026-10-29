import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { GET } from '../src/app/api/backend/me/route.js';

const envKeys = [
  'NODE_ENV',
  'BETTER_AUTH_DEV_ENABLED',
  'BETTER_AUTH_SCHEMA_READY',
  'WEB_ORIGIN',
  'API_URL',
] as const;
const savedEnv = new Map(envKeys.map((key) => [key, process.env[key]]));
const originalFetch = globalThis.fetch;

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

test('BFF rejects missing, malformed, and duplicate session cookies', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return Response.json({ user: {} });
  };

  for (const cookie of [
    undefined,
    'safeguard-auth.session_token=',
    'safeguard-auth.session_token=one; safeguard-auth.session_token=two',
  ]) {
    const headers = cookie ? { cookie } : undefined;
    const response = await GET(
      new Request('http://localhost:3000/api/backend/me', headers ? { headers } : undefined),
    );
    assert.equal(response.status, 401);
  }
  assert.equal(calls, 0);
});

test('BFF forwards only the exact session cookie to the fixed API destination', async () => {
  let destination: URL | undefined;
  let forwardedHeaders: Headers | undefined;
  globalThis.fetch = async (input, init) => {
    destination = new URL(input.toString());
    forwardedHeaders = new Headers(init?.headers);
    return Response.json({ user: { role: 'VIEWER' } });
  };

  const response = await GET(
    new Request('http://localhost:3000/api/backend/me', {
      headers: {
        cookie: 'other=value; safeguard-auth.session_token=opaque',
        authorization: 'Bearer forged',
        'x-user-id': 'attacker',
        'x-user-role': 'ADMIN',
        'x-authenticated-user': 'attacker',
        'x-forwarded-host': 'attacker.invalid',
      },
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(destination?.href, 'http://127.0.0.1:4000/api/v1/internal/me');
  assert.equal(forwardedHeaders?.get('cookie'), 'safeguard-auth.session_token=opaque');
  assert.equal(forwardedHeaders?.get('authorization'), null);
  assert.equal(forwardedHeaders?.get('x-user-id'), null);
  assert.equal(forwardedHeaders?.get('x-user-role'), null);
  assert.equal(forwardedHeaders?.get('x-authenticated-user'), null);
  assert.equal(forwardedHeaders?.get('x-forwarded-host'), null);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('BFF accepts same-origin GET with or without Origin and localhost aliases', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return Response.json({ user: { id: 'verified-upstream' } });
  };

  for (const [url, headers] of [
    ['http://localhost:3000/api/backend/me', { cookie: 'safeguard-auth.session_token=opaque' }],
    [
      'http://localhost:3000/api/backend/me',
      { origin: 'http://localhost:3000', cookie: 'safeguard-auth.session_token=opaque' },
    ],
    [
      'http://127.0.0.1:3000/api/backend/me',
      { origin: 'http://127.0.0.1:3000', cookie: 'safeguard-auth.session_token=opaque' },
    ],
  ] as const) {
    assert.equal((await GET(new Request(url, { headers }))).status, 200);
  }
  assert.equal(calls, 3);
});

test('BFF rejects foreign origin and never contacts the API', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return Response.json({ user: {} });
  };
  const cases: Array<Record<string, string>> = [
    { origin: 'https://attacker.invalid', cookie: 'safeguard-auth.session_token=opaque' },
    { origin: 'null', cookie: 'safeguard-auth.session_token=opaque' },
    { origin: 'http://localhost:3000', cookie: 'safeguard-auth.session_token=opaque' },
    {
      'sec-fetch-site': 'cross-site',
      cookie: 'safeguard-auth.session_token=opaque',
    },
  ];
  for (const headers of cases) {
    const requestUrl =
      headers.origin === 'http://localhost:3000'
        ? 'http://127.0.0.1:3000/api/backend/me'
        : 'http://localhost:3000/api/backend/me';
    const response = await GET(new Request(requestUrl, { headers }));
    assert.equal(response.status, 403);
  }
  assert.equal(calls, 0);
});

test('BFF propagates authorization statuses and hides upstream failures', async () => {
  const request = () =>
    new Request('http://localhost:3000/api/backend/me', {
      headers: { cookie: 'safeguard-auth.session_token=opaque' },
    });
  for (const status of [401, 403]) {
    globalThis.fetch = async () => new Response(null, { status });
    assert.equal((await GET(request())).status, status);
  }

  globalThis.fetch = async () => {
    throw new Error('private network detail');
  };
  const failed = await GET(request());
  assert.equal(failed.status, 502);
  assert.deepEqual(await failed.json(), { error: 'api_unavailable' });
});
