import assert from 'node:assert/strict';
import test from 'node:test';
import { getPasswordValidationError, readInviteToken } from '../src/lib/auth-invite.mjs';

test('accepts only invite token hashes and never treats other OTP types as invites', () => {
  assert.equal(readInviteToken(new URLSearchParams('token_hash=opaque&type=invite')), 'opaque');
  assert.equal(readInviteToken(new URLSearchParams('token_hash=opaque&type=recovery')), null);
  assert.equal(readInviteToken(new URLSearchParams('type=invite')), null);
  assert.equal(
    readInviteToken(new URLSearchParams(`token_hash=${'x'.repeat(4097)}&type=invite`)),
    null,
  );
});

test('requires matching passwords between 12 and 128 characters', () => {
  assert.equal(getPasswordValidationError('short-pass', 'different'), 'password-mismatch');
  assert.equal(getPasswordValidationError('short-pass', 'short-pass'), 'password-too-short');
  assert.equal(getPasswordValidationError('x'.repeat(129), 'x'.repeat(129)), 'password-too-long');
  assert.equal(getPasswordValidationError('long-enough-password', 'long-enough-password'), null);
});
