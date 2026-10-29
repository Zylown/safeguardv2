import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseTokenVerifier, type SupabaseClientFactory } from './supabase-token-verifier';

jest.mock('@nestjs/common', () => {
  class HttpException extends Error {}
  return {
    Inject: () => () => undefined,
    Injectable: () => (target: unknown) => target,
    ServiceUnavailableException: class ServiceUnavailableException extends HttpException {},
    UnauthorizedException: class UnauthorizedException extends HttpException {},
  };
});
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));

describe('SupabaseTokenVerifier', () => {
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const validClaims = {
    sub: 'a9eebc6e-bf83-47ae-a329-7fbf2bf7f9ad',
    email: 'staff@example.test',
    iss: 'https://safe-project.supabase.co/auth/v1',
    aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 60,
  };

  afterEach(() => {
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
    else process.env.SUPABASE_PUBLISHABLE_KEY = originalKey;
  });

  it('accepts claims verified by the Supabase Auth SDK', async () => {
    process.env.SUPABASE_URL = 'https://safe-project.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'public-test-key';
    const factory = jest.fn(
      () =>
        ({
          auth: {
            getClaims: jest.fn().mockResolvedValue({ data: { claims: validClaims }, error: null }),
          },
        }) as unknown as SupabaseClient,
    ) as unknown as SupabaseClientFactory;
    const verifier = new SupabaseTokenVerifier(factory);

    await expect(verifier.verify('test-token')).resolves.toEqual({
      authUserId: validClaims.sub,
      email: validClaims.email,
    });
    expect(factory).toHaveBeenCalledWith(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_PUBLISHABLE_KEY,
    );
  });

  it('rejects invalid issuer, audience, or expired claims', async () => {
    process.env.SUPABASE_URL = 'https://safe-project.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'public-test-key';
    for (const claims of [
      { ...validClaims, iss: 'https://attacker.invalid/auth/v1' },
      { ...validClaims, aud: 'anon' },
      { ...validClaims, exp: 1 },
    ]) {
      const factory = (() =>
        ({
          auth: { getClaims: async () => ({ data: { claims }, error: null }) },
        }) as unknown as SupabaseClient) as SupabaseClientFactory;
      await expect(new SupabaseTokenVerifier(factory).verify('test-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    }
  });

  it('fails closed when Supabase auth configuration is absent', async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
    const verifier = new SupabaseTokenVerifier(jest.fn() as unknown as SupabaseClientFactory);
    await expect(verifier.verify('test-token')).rejects.toBeInstanceOf(Error);
  });

  it('reports Auth network failures as unavailable rather than accepting a token', async () => {
    process.env.SUPABASE_URL = 'https://safe-project.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'public-test-key';
    const factory = (() =>
      ({
        auth: {
          getClaims: async () => {
            throw new Error('network unavailable');
          },
        },
      }) as unknown as SupabaseClient) as SupabaseClientFactory;
    await expect(new SupabaseTokenVerifier(factory).verify('test-token')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
