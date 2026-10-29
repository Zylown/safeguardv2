import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decideHomeEntry, signOutAndRedirect } from '../src/lib/home-entry';

test('routes a missing Better Auth session to private login', () => {
  assert.equal(decideHomeEntry('missing', 'unchecked'), 'login');
});

test('does not treat a session alone as enterprise authorization', () => {
  assert.equal(decideHomeEntry('active', 'unchecked'), 'checking');
  assert.equal(decideHomeEntry('active', 'denied'), 'restricted');
});

test('routes an authorized ADMIN only after backend authorization succeeds', () => {
  assert.equal(decideHomeEntry('active', 'admin'), 'dashboard');
});

test('routes revoked or missing backend sessions back to login', () => {
  assert.equal(decideHomeEntry('active', 'missing'), 'login');
});

test('fails closed with a retry state when session or authorization is unavailable', () => {
  assert.equal(decideHomeEntry('failed', 'unchecked'), 'retry');
  assert.equal(decideHomeEntry('active', 'failed'), 'retry');
});

test('redirects only after a successful real sign-out', async () => {
  let redirected = false;
  const success = await signOutAndRedirect(
    async () => ({ error: null }),
    () => {
      redirected = true;
    },
  );
  assert.equal(success, true);
  assert.equal(redirected, true);

  redirected = false;
  const failure = await signOutAndRedirect(
    async () => ({ error: new Error('failed') }),
    () => {
      redirected = true;
    },
  );
  assert.equal(failure, false);
  assert.equal(redirected, false);
});
