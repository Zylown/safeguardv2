import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import {
  getSafeGuardAuth,
  isBetterAuthDevelopmentEnabled,
} from '../auth/auth.config';
import { PrismaService } from '../prisma/prisma.service';
import type { InternalRole } from '../generated/prisma/client';

export interface BetterAuthInternalUser {
  id: string;
  email: string;
  fullName: string | null;
  role: InternalRole;
}

export interface BetterAuthRequest {
  headers: { cookie?: string };
  betterAuthInternalUser?: BetterAuthInternalUser;
}

export interface VerifiedBetterAuthSession {
  user: { id: string };
  session: { createdAt: Date | string };
}

export interface BetterAuthIdentity {
  id: string;
  email: string;
  name: string;
  role: string | null;
  banned: boolean | null;
  twoFactorEnabled: boolean | null;
  twoFactorEnabledAt: Date | string | null;
}

export type BetterAuthSessionLookup = (
  headers: Headers,
) => Promise<VerifiedBetterAuthSession | null>;
export type BetterAuthIdentityLookup = (
  betterAuthUserId: string,
) => Promise<BetterAuthIdentity | null>;
export type BetterAuthInternalUserLookup = (
  betterAuthUserId: string,
) => Promise<(BetterAuthInternalUser & { isActive: boolean }) | null>;
export type BetterAuthInternalUserCreate = (
  identity: BetterAuthIdentity,
  role: InternalRole,
) => Promise<BetterAuthInternalUser & { isActive: boolean }>;
export type VerifiedTwoFactorLookup = (
  betterAuthUserId: string,
) => Promise<boolean>;

const BETTER_AUTH_ROLE_MAP: Readonly<Record<string, InternalRole>> = {
  admin: 'SUPER_ADMIN',
};

export function mapBetterAuthRoleToInternalRole(
  role: string | null,
): InternalRole | null {
  return role === null ? null : (BETTER_AUTH_ROLE_MAP[role] ?? null);
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SESSION_COOKIE_NAMES = [
  'safeguard-auth.session_token',
  '__Secure-safeguard-auth.session_token',
] as const;

export function getSingleBetterAuthSessionCookie(
  cookieHeader: string | undefined,
): string | null {
  if (!cookieHeader || cookieHeader.length > 8192) return null;
  const expectedName =
    process.env.NODE_ENV === 'production'
      ? SESSION_COOKIE_NAMES[1]
      : SESSION_COOKIE_NAMES[0];
  const matches = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${expectedName}=`));
  if (matches.length !== 1) return null;
  const [, value] = matches[0]!.split('=', 2);
  return value?.trim() ? matches[0]! : null;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}

export async function resolveBetterAuthInternalUser(
  cookieHeader: string | undefined,
  getSession: BetterAuthSessionLookup,
  findIdentity: BetterAuthIdentityLookup,
  findInternalUser: BetterAuthInternalUserLookup,
  createInternalUser: BetterAuthInternalUserCreate,
  hasVerifiedTwoFactor: VerifiedTwoFactorLookup = async () => false,
): Promise<BetterAuthInternalUser> {
  const sessionCookie = getSingleBetterAuthSessionCookie(cookieHeader);
  if (!sessionCookie) {
    throw new UnauthorizedException('A valid Better Auth session is required.');
  }

  let session: VerifiedBetterAuthSession | null;
  try {
    session = await getSession(new Headers({ cookie: sessionCookie }));
  } catch {
    throw new ServiceUnavailableException(
      'Better Auth session verification is unavailable.',
    );
  }

  if (!session?.user.id || !UUID_PATTERN.test(session.user.id)) {
    throw new UnauthorizedException('A valid Better Auth session is required.');
  }

  let identity: BetterAuthIdentity | null;
  try {
    identity = await findIdentity(session.user.id);
  } catch {
    throw new ServiceUnavailableException(
      'Better Auth identity lookup is unavailable.',
    );
  }
  if (!identity)
    throw new UnauthorizedException('A valid Better Auth session is required.');

  const internalRole = mapBetterAuthRoleToInternalRole(identity.role);
  if (identity.banned !== false || internalRole === null) {
    throw new ForbiddenException('This account is not authorized.');
  }

  let user: (BetterAuthInternalUser & { isActive: boolean }) | null;
  try {
    user = await findInternalUser(identity.id);
  } catch {
    throw new ServiceUnavailableException(
      'Internal authorization is unavailable.',
    );
  }

  if (!user) {
    try {
      user = await createInternalUser(identity, internalRole);
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw new ServiceUnavailableException(
          'Internal authorization is unavailable.',
        );
      }
      // The unique betterAuthUserId index serializes concurrent first logins. Read
      // the winner's row and never overwrite an existing identity's authorization.
      try {
        user = await findInternalUser(identity.id);
      } catch {
        throw new ServiceUnavailableException(
          'Internal authorization is unavailable.',
        );
      }
      if (!user)
        throw new ServiceUnavailableException(
          'Internal authorization is unavailable.',
        );
    }
  }

  if (
    !user.isActive ||
    (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')
  ) {
    throw new ForbiddenException('This account is not authorized.');
  }

  if (identity.twoFactorEnabled === true) {
    const enabledAt = identity.twoFactorEnabledAt
      ? new Date(identity.twoFactorEnabledAt)
      : null;
    const sessionCreatedAt = new Date(session.session.createdAt);
    if (
      !enabledAt ||
      !Number.isFinite(enabledAt.getTime()) ||
      !Number.isFinite(sessionCreatedAt.getTime()) ||
      sessionCreatedAt < enabledAt
    ) {
      throw new ForbiddenException(
        'A fresh session with verified two-factor authentication is required.',
      );
    }

    let mfaVerified: boolean;
    try {
      mfaVerified = await hasVerifiedTwoFactor(identity.id);
    } catch {
      throw new ServiceUnavailableException(
        'Two-factor authorization is unavailable.',
      );
    }
    if (!mfaVerified) {
      throw new ForbiddenException(
        'Verified two-factor authentication is required.',
      );
    }
  } else if (process.env.NODE_ENV !== 'development') {
    throw new ForbiddenException(
      'Two-factor authentication is required outside development.',
    );
  }

  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
  };
}

@Injectable()
export class BetterAuthInternalUserGuard implements CanActivate {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!isBetterAuthDevelopmentEnabled()) throw new NotFoundException();

    const request = context.switchToHttp().getRequest<BetterAuthRequest>();
    const user = await resolveBetterAuthInternalUser(
      request.headers.cookie,
      async (headers) => {
        const session = await getSafeGuardAuth(this.prisma).api.getSession({
          headers,
          query: { disableCookieCache: true, disableRefresh: true },
        });
        return session?.user.id ? session : null;
      },
      async (betterAuthUserId) =>
        this.prisma.user.findUnique({
          where: { id: betterAuthUserId },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            banned: true,
            twoFactorEnabled: true,
            twoFactorEnabledAt: true,
          },
        }),
      async (betterAuthUserId) =>
        this.prisma.internalUser.findUnique({
          where: { betterAuthUserId },
          select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
            isActive: true,
          },
        }),
      async (identity, role) =>
        this.prisma.internalUser.create({
          data: {
            betterAuthUserId: identity.id,
            email: identity.email,
            fullName: identity.name.slice(0, 200),
            role,
            isActive: true,
          },
          select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
            isActive: true,
          },
        }),
      async (betterAuthUserId) => {
        const enrollment = await this.prisma.twoFactor.findFirst({
          where: { userId: betterAuthUserId, verified: true },
          select: { id: true },
        });
        return enrollment !== null;
      },
    );

    request.betterAuthInternalUser = user;
    return true;
  }
}
