jest.mock('@nestjs/common', () => {
  class HttpException extends Error {}
  return {
    Inject: () => () => undefined,
    Injectable: () => (target: unknown) => target,
    ForbiddenException: class ForbiddenException extends HttpException {},
    NotFoundException: class NotFoundException extends HttpException {},
    ServiceUnavailableException: class ServiceUnavailableException extends HttpException {},
    UnauthorizedException: class UnauthorizedException extends HttpException {},
  };
});
jest.mock('../auth/auth.config', () => ({
  getSafeGuardAuth: jest.fn(),
  isBetterAuthDevelopmentEnabled: jest.fn(() => true),
}));

import {
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  getSingleBetterAuthSessionCookie,
  mapBetterAuthRoleToInternalRole,
  resolveBetterAuthInternalUser,
} from './better-auth-internal-user.guard';
import type {
  BetterAuthIdentity,
  BetterAuthInternalUserLookup,
  BetterAuthSessionLookup,
} from './better-auth-internal-user.guard';

describe('BetterAuthInternalUserGuard boundary', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const authUserId = 'a9eebc6e-bf83-47ae-a329-7fbf2bf7f9ad';
  const activeInternalUser = {
    id: 'ccbbda56-785a-4d85-9dc4-2dbf8c8a6803',
    email: 'staff@example.test',
    fullName: 'Staff Member',
    role: 'SUPER_ADMIN' as const,
    isActive: true,
  };
  const identity: BetterAuthIdentity = {
    id: authUserId,
    email: 'owner@example.test',
    name: 'Owner Name',
    role: 'admin',
    banned: false,
    twoFactorEnabled: false,
    twoFactorEnabledAt: null,
  };
  const cookie = 'safeguard-auth.session_token=opaque';
  const getSession: BetterAuthSessionLookup = async () => ({
    user: { id: authUserId },
    session: { createdAt: new Date('2026-10-16T10:00:01.000Z') },
  });

  beforeEach(() => {
    process.env.NODE_ENV = 'development';
  });

  afterAll(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  it('extracts exactly one expected session cookie and rejects malformed or duplicate cookies', () => {
    expect(getSingleBetterAuthSessionCookie(undefined)).toBeNull();
    expect(getSingleBetterAuthSessionCookie('other=value')).toBeNull();
    expect(
      getSingleBetterAuthSessionCookie(
        'safeguard-auth.session_token=one; safeguard-auth.session_token=two',
      ),
    ).toBeNull();
    expect(getSingleBetterAuthSessionCookie(`other=value; ${cookie}`)).toBe(
      cookie,
    );
  });

  it('centralizes the Better Auth role mapping and rejects unmapped roles', () => {
    expect(mapBetterAuthRoleToInternalRole('admin')).toBe('SUPER_ADMIN');
    expect(mapBetterAuthRoleToInternalRole('user')).toBeNull();
    expect(mapBetterAuthRoleToInternalRole(null)).toBeNull();
  });

  it('creates the first active SUPER_ADMIN from an eligible Better Auth admin identity', async () => {
    const findInternalUser = jest.fn(async () => null);
    const createInternalUser = jest.fn(async () => activeInternalUser);

    await expect(
      resolveBetterAuthInternalUser(
        cookie,
        getSession,
        async () => identity,
        findInternalUser,
        createInternalUser,
      ),
    ).resolves.toMatchObject({ role: 'SUPER_ADMIN' });
    expect(createInternalUser).toHaveBeenCalledWith(identity, 'SUPER_ADMIN');
    expect(findInternalUser).toHaveBeenCalledTimes(1);
  });

  it('uses an existing active InternalUser without creating or modifying it', async () => {
    const findInternalUser = jest.fn(async () => ({
      ...activeInternalUser,
      role: 'ADMIN' as const,
    }));
    const createInternalUser = jest.fn();

    await expect(
      resolveBetterAuthInternalUser(
        cookie,
        getSession,
        async () => identity,
        findInternalUser,
        createInternalUser,
      ),
    ).resolves.toMatchObject({ id: activeInternalUser.id, role: 'ADMIN' });
    expect(createInternalUser).not.toHaveBeenCalled();
  });

  it('does not reactivate an existing inactive InternalUser', async () => {
    const inactive = { ...activeInternalUser, isActive: false };
    const createInternalUser = jest.fn();
    await expect(
      resolveBetterAuthInternalUser(
        cookie,
        getSession,
        async () => identity,
        async () => inactive,
        createInternalUser,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(createInternalUser).not.toHaveBeenCalled();
  });

  it('denies a Better Auth identity without the admin role', async () => {
    const findInternalUser = jest.fn();
    await expect(
      resolveBetterAuthInternalUser(
        cookie,
        getSession,
        async () => ({ ...identity, role: 'user' }),
        findInternalUser,
        jest.fn(),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(findInternalUser).not.toHaveBeenCalled();
  });

  it('denies banned identities even when Better Auth role is admin', async () => {
    const findInternalUser = jest.fn();
    await expect(
      resolveBetterAuthInternalUser(
        cookie,
        getSession,
        async () => ({ ...identity, banned: true }),
        findInternalUser,
        jest.fn(),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(findInternalUser).not.toHaveBeenCalled();
  });

  it('returns 401 for a missing or invalid session before looking up identity', async () => {
    const findIdentity = jest.fn();
    await expect(
      resolveBetterAuthInternalUser(
        undefined,
        getSession,
        findIdentity,
        jest.fn(),
        jest.fn(),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      resolveBetterAuthInternalUser(
        cookie,
        async () => null,
        findIdentity,
        jest.fn(),
        jest.fn(),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(findIdentity).not.toHaveBeenCalled();
  });

  it('re-reads the row after a concurrent first-login unique conflict', async () => {
    let reads = 0;
    const findInternalUser: BetterAuthInternalUserLookup = async () => {
      reads += 1;
      return reads === 1 ? null : activeInternalUser;
    };
    const createInternalUser = jest.fn(async () => {
      throw Object.assign(new Error('unique'), { code: 'P2002' });
    });

    await expect(
      resolveBetterAuthInternalUser(
        cookie,
        getSession,
        async () => identity,
        findInternalUser,
        createInternalUser,
      ),
    ).resolves.toMatchObject({ id: activeInternalUser.id });
    expect(reads).toBe(2);
  });

  it('preserves TOTP enforcement in production and requires a fresh verified session', async () => {
    process.env.NODE_ENV = 'production';
    await expect(
      resolveBetterAuthInternalUser(
        '__Secure-safeguard-auth.session_token=opaque',
        getSession,
        async () => identity,
        async () => activeInternalUser,
        jest.fn(),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const enrolledIdentity = {
      ...identity,
      twoFactorEnabled: true,
      twoFactorEnabledAt: new Date('2026-10-16T10:00:00.000Z'),
    };
    await expect(
      resolveBetterAuthInternalUser(
        '__Secure-safeguard-auth.session_token=opaque',
        getSession,
        async () => enrolledIdentity,
        async () => activeInternalUser,
        jest.fn(),
        async () => true,
      ),
    ).resolves.toMatchObject({ role: 'SUPER_ADMIN' });
  });

  it('fails closed when session, identity, database, or MFA lookup fails', async () => {
    await expect(
      resolveBetterAuthInternalUser(
        cookie,
        async () => {
          throw new Error('private');
        },
        async () => identity,
        jest.fn(),
        jest.fn(),
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(
      resolveBetterAuthInternalUser(
        cookie,
        getSession,
        async () => {
          throw new Error('private');
        },
        jest.fn(),
        jest.fn(),
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(
      resolveBetterAuthInternalUser(
        cookie,
        getSession,
        async () => identity,
        async () => {
          throw new Error('private');
        },
        jest.fn(),
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
