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
import type { ExecutionContext } from '@nestjs/common';
import { getSafeGuardAuth } from '../auth/auth.config';
import type { PrismaService } from '../prisma/prisma.service';
import {
  BetterAuthInternalUserGuard,
  getSingleBetterAuthSessionCookie,
  resolveBetterAuthInternalUser,
} from './better-auth-internal-user.guard';

describe('BetterAuthInternalUserGuard boundary', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const authUserId = 'a9eebc6e-bf83-47ae-a329-7fbf2bf7f9ad';
  const internalUser = {
    id: 'ccbbda56-785a-4d85-9dc4-2dbf8c8a6803',
    email: 'staff@example.test',
    fullName: 'Staff Member',
    role: 'ADMIN' as const,
    isActive: true,
  };
  const verifiedSession = (id = authUserId, createdAt = new Date('2026-10-16T10:00:01.000Z')) => ({
    user: {
      id,
      twoFactorEnabled: true,
      twoFactorEnabledAt: new Date('2026-10-16T10:00:00.000Z'),
    },
    session: { createdAt },
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
    expect(
      getSingleBetterAuthSessionCookie('other=value; safeguard-auth.session_token=opaque'),
    ).toBe('safeguard-auth.session_token=opaque');
  });

  it('rejects missing and invalid sessions before internal lookup', async () => {
    const lookup = jest.fn();
    await expect(
      resolveBetterAuthInternalUser(undefined, jest.fn(), lookup),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      resolveBetterAuthInternalUser(
        'safeguard-auth.session_token=invalid',
        async () => null,
        lookup,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('passes only the session cookie to Better Auth, ignoring forged identity headers', async () => {
    const getSession = jest.fn(async (headers: Headers) => {
      expect(headers.get('cookie')).toBe('safeguard-auth.session_token=opaque');
      expect(headers.get('x-user-id')).toBeNull();
      return {
        user: {
          id: authUserId,
          twoFactorEnabled: true,
          twoFactorEnabledAt: new Date('2026-10-16T10:00:00.000Z'),
        },
        session: { createdAt: new Date('2026-10-16T10:00:01.000Z') },
      };
    });
    const lookup = jest.fn(async () => internalUser);

    await expect(
      resolveBetterAuthInternalUser(
        'safeguard-auth.session_token=opaque; x-user-id=attacker',
        getSession,
        lookup,
        async () => true,
      ),
    ).resolves.toEqual({
      id: internalUser.id,
      email: internalUser.email,
      fullName: internalUser.fullName,
      role: internalUser.role,
    });
    expect(lookup).toHaveBeenCalledWith(authUserId);
  });

  it('rejects invalid identity ids, missing users, and inactive users', async () => {
    const invalidIdLookup = jest.fn();
    await expect(
      resolveBetterAuthInternalUser(
        'safeguard-auth.session_token=opaque',
        async () => verifiedSession('attacker-controlled-id'),
        invalidIdLookup,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(invalidIdLookup).not.toHaveBeenCalled();

    const getSession = async () => verifiedSession();
    await expect(
      resolveBetterAuthInternalUser(
        'safeguard-auth.session_token=opaque',
        getSession,
        async () => null,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      resolveBetterAuthInternalUser(
        'safeguard-auth.session_token=opaque',
        getSession,
        async () => ({ ...internalUser, isActive: false }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects active internal users without the ADMIN business role', async () => {
    await expect(
      resolveBetterAuthInternalUser(
        'safeguard-auth.session_token=opaque',
        async () => verifiedSession(),
        async () => ({ ...internalUser, role: 'OPERATIONS' as const }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a SUPER_ADMIN only with a fresh session and verified TOTP enrollment', async () => {
    const session = {
      user: {
        id: authUserId,
        twoFactorEnabled: true,
        twoFactorEnabledAt: new Date('2026-10-16T10:00:00.000Z'),
      },
      session: { createdAt: new Date('2026-10-16T10:00:01.000Z') },
    };
    await expect(
      resolveBetterAuthInternalUser(
        'safeguard-auth.session_token=opaque',
        async () => session,
        async () => ({ ...internalUser, role: 'SUPER_ADMIN' as const }),
        async () => true,
      ),
    ).resolves.toMatchObject({ role: 'SUPER_ADMIN' });
  });

  it('allows an active administrator in development before optional TOTP enrollment', async () => {
    await expect(
      resolveBetterAuthInternalUser(
        'safeguard-auth.session_token=opaque',
        async () => ({
          user: { id: authUserId, twoFactorEnabled: false },
          session: { createdAt: new Date('2026-10-16T10:00:00.000Z') },
        }),
        async () => ({ ...internalUser, role: 'SUPER_ADMIN' as const }),
      ),
    ).resolves.toMatchObject({ role: 'SUPER_ADMIN' });
  });

  it('requires TOTP outside development when the account has not enrolled', async () => {
    process.env.NODE_ENV = 'production';
    await expect(
      resolveBetterAuthInternalUser(
        '__Secure-safeguard-auth.session_token=opaque',
        async () => ({
          user: { id: authUserId, twoFactorEnabled: false },
          session: { createdAt: new Date('2026-10-16T10:00:00.000Z') },
        }),
        async () => ({ ...internalUser, role: 'SUPER_ADMIN' as const }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    process.env.NODE_ENV = 'development';
  });

  it('denies sessions issued before TOTP enrollment and unverified enrollment records', async () => {
    const preEnrollmentSession = {
      user: {
        id: authUserId,
        twoFactorEnabled: true,
        twoFactorEnabledAt: new Date('2026-10-16T10:00:00.000Z'),
      },
      session: { createdAt: new Date('2026-10-16T09:59:00.000Z') },
    };
    await expect(
      resolveBetterAuthInternalUser(
        'safeguard-auth.session_token=opaque',
        async () => preEnrollmentSession,
        async () => internalUser,
        async () => true,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      resolveBetterAuthInternalUser(
        'safeguard-auth.session_token=opaque',
        async () => ({
          ...preEnrollmentSession,
          session: { createdAt: new Date('2026-10-16T10:00:01Z') },
        }),
        async () => internalUser,
        async () => false,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('checks persisted MFA state even when the session omits the optional TOTP plugin fields', async () => {
    const getSession = jest.fn(async () => ({
      user: { id: authUserId },
      session: { createdAt: new Date('2026-10-16T09:59:00.000Z') },
    }));
    jest.mocked(getSafeGuardAuth).mockReturnValue({ api: { getSession } } as never);
    const findUnique = jest.fn(async () => ({
      twoFactorEnabled: true,
      twoFactorEnabledAt: new Date('2026-10-16T10:00:00.000Z'),
    }));
    const prisma = { user: { findUnique }, internalUser: { findUnique: async () => internalUser } };
    const guard = new BetterAuthInternalUserGuard(prisma as unknown as PrismaService);
    const request = { headers: { cookie: 'safeguard-auth.session_token=opaque' } };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: authUserId },
      select: { twoFactorEnabled: true, twoFactorEnabledAt: true },
    });
    expect(request).not.toHaveProperty('betterAuthInternalUser');
  });

  it('fails closed when the session authority or internal database is unavailable', async () => {
    const cookie = 'safeguard-auth.session_token=opaque';
    await expect(
      resolveBetterAuthInternalUser(
        cookie,
        async () => {
          throw new Error('private');
        },
        jest.fn(),
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(
      resolveBetterAuthInternalUser(
        cookie,
        async () => verifiedSession(),
        async () => {
          throw new Error('private');
        },
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(
      resolveBetterAuthInternalUser(
        cookie,
        async () => verifiedSession(),
        async () => internalUser,
        async () => {
          throw new Error('private');
        },
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
