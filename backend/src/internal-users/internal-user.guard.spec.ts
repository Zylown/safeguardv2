import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { InternalUserGuard } from './internal-user.guard';
import type { SupabaseTokenVerifier } from './supabase-token-verifier';
import type { PrismaService } from '../prisma/prisma.service';

jest.mock('@nestjs/common', () => {
  class HttpException extends Error {}
  return {
    Inject: () => () => undefined,
    Injectable: () => (target: unknown) => target,
    ForbiddenException: class ForbiddenException extends HttpException {},
    ServiceUnavailableException: class ServiceUnavailableException extends HttpException {},
    UnauthorizedException: class UnauthorizedException extends HttpException {},
  };
});
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));

describe('InternalUserGuard', () => {
  const identity = {
    authUserId: 'a9eebc6e-bf83-47ae-a329-7fbf2bf7f9ad',
    email: 'staff@example.test',
  };
  const activeUser = {
    id: 'ccbbda56-785a-4d85-9dc4-2dbf8c8a6803',
    authUserId: identity.authUserId,
    email: identity.email,
    fullName: 'Staff Member',
    role: 'OPERATIONS' as const,
    isActive: true,
  };

  function context(authorization?: string) {
    const request: { headers: { authorization?: string }; internalUser?: unknown } = {
      headers: authorization ? { authorization } : {},
    };
    return {
      request,
      executionContext: {
        switchToHttp: () => ({ getRequest: () => request }),
      } as unknown as ExecutionContext,
    };
  }

  it('requires a bearer token and rejects unauthenticated callers', async () => {
    const verifier = { verify: jest.fn() } as unknown as SupabaseTokenVerifier;
    const prisma = { internalUser: { findUnique: jest.fn() } } as unknown as PrismaService;
    const guard = new InternalUserGuard(verifier, prisma);
    const { executionContext } = context();

    await expect(guard.canActivate(executionContext)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(verifier.verify).not.toHaveBeenCalled();
  });

  it('allows only an active provisioned internal account and attaches a safe identity', async () => {
    const verifier = {
      verify: jest.fn().mockResolvedValue(identity),
    } as unknown as SupabaseTokenVerifier;
    const prisma = {
      internalUser: { findUnique: jest.fn().mockResolvedValue(activeUser) },
    } as unknown as PrismaService;
    const guard = new InternalUserGuard(verifier, prisma);
    const { executionContext, request } = context('Bearer signed-token');

    await expect(guard.canActivate(executionContext)).resolves.toBe(true);
    expect(request.internalUser).toEqual({
      id: activeUser.id,
      authUserId: activeUser.authUserId,
      email: activeUser.email,
      fullName: activeUser.fullName,
      role: activeUser.role,
    });
  });

  it('denies identities without an active internal-user record', async () => {
    const verifier = {
      verify: jest.fn().mockResolvedValue(identity),
    } as unknown as SupabaseTokenVerifier;
    const prisma = {
      internalUser: { findUnique: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const guard = new InternalUserGuard(verifier, prisma);
    const { executionContext } = context('Bearer signed-token');

    await expect(guard.canActivate(executionContext)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
