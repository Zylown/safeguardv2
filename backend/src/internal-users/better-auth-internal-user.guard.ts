import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { getSafeGuardAuth, isBetterAuthDevelopmentEnabled } from '../auth/auth.config';
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
  user: {
    id: string;
    twoFactorEnabled?: boolean;
    twoFactorEnabledAt?: Date | string | null;
  };
  session: { createdAt: Date | string };
}

export type BetterAuthSessionLookup = (
  headers: Headers,
) => Promise<VerifiedBetterAuthSession | null>;
export type BetterAuthInternalUserLookup = (
  betterAuthUserId: string,
) => Promise<(BetterAuthInternalUser & { isActive: boolean }) | null>;
export type VerifiedTwoFactorLookup = (betterAuthUserId: string) => Promise<boolean>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SESSION_COOKIE_NAMES = [
  'safeguard-auth.session_token',
  '__Secure-safeguard-auth.session_token',
] as const;

export function getSingleBetterAuthSessionCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader || cookieHeader.length > 8192) return null;
  const expectedName =
    process.env.NODE_ENV === 'production' ? SESSION_COOKIE_NAMES[1] : SESSION_COOKIE_NAMES[0];
  const matches = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${expectedName}=`));
  if (matches.length !== 1) return null;
  const [, value] = matches[0]!.split('=', 2);
  return value?.trim() ? matches[0]! : null;
}

export async function resolveBetterAuthInternalUser(
  cookieHeader: string | undefined,
  getSession: BetterAuthSessionLookup,
  findInternalUser: BetterAuthInternalUserLookup,
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
    throw new ServiceUnavailableException('Better Auth session verification is unavailable.');
  }

  if (!session?.user.id)
    throw new UnauthorizedException('A valid Better Auth session is required.');
  if (!UUID_PATTERN.test(session.user.id)) {
    throw new UnauthorizedException('A valid Better Auth session is required.');
  }

  let user: (BetterAuthInternalUser & { isActive: boolean }) | null;
  try {
    user = await findInternalUser(session.user.id);
  } catch {
    throw new ServiceUnavailableException('Internal authorization is unavailable.');
  }

  if (!user?.isActive || (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')) {
    throw new ForbiddenException('No active administrator account is assigned to this identity.');
  }

  if (session.user.twoFactorEnabled === true) {
    const enabledAt = session.user.twoFactorEnabledAt
      ? new Date(session.user.twoFactorEnabledAt)
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
      mfaVerified = await hasVerifiedTwoFactor(session.user.id);
    } catch {
      throw new ServiceUnavailableException('Two-factor authorization is unavailable.');
    }
    if (!mfaVerified) {
      throw new ForbiddenException('Verified two-factor authentication is required.');
    }
  } else if (process.env.NODE_ENV !== 'development') {
    throw new ForbiddenException('Two-factor authentication is required outside development.');
  }
  return { id: user.id, email: user.email, fullName: user.fullName, role: user.role };
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
        if (!session?.user.id) return null;
        // Consult the persisted MFA state even when the optional TOTP plugin is gated off.
        // A previously enrolled identity must never fall back to a password-only session.
        const account = await this.prisma.user.findUnique({
          where: { id: session.user.id },
          select: { twoFactorEnabled: true, twoFactorEnabledAt: true },
        });
        if (!account) return null;
        return {
          ...session,
          user: {
            ...session.user,
            twoFactorEnabled: account.twoFactorEnabled === true,
            twoFactorEnabledAt: account.twoFactorEnabledAt,
          },
        };
      },
      async (betterAuthUserId) => {
        const internalUser = await this.prisma.internalUser.findUnique({
          where: { betterAuthUserId },
          select: { id: true, email: true, fullName: true, role: true, isActive: true },
        });
        return internalUser;
      },
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
