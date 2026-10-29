import {
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseTokenVerifier } from './supabase-token-verifier';
import type { VerifiedSupabaseIdentity } from './supabase-token-verifier';
import type { InternalRole } from '../generated/prisma/client';

export interface AuthenticatedInternalUser {
  id: string;
  authUserId: string;
  email: string;
  fullName: string | null;
  role: InternalRole;
}

export interface AuthenticatedRequest {
  headers: { authorization?: string };
  internalUser?: AuthenticatedInternalUser;
}

@Injectable()
export class InternalUserGuard implements CanActivate {
  constructor(
    @Inject(SupabaseTokenVerifier)
    private readonly tokenVerifier: SupabaseTokenVerifier,
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const match =
      typeof authorization === 'string' ? /^Bearer ([^\s]+)$/i.exec(authorization) : null;
    if (!match?.[1]) throw new UnauthorizedException('A valid bearer token is required.');

    let identity: VerifiedSupabaseIdentity;
    try {
      identity = await this.tokenVerifier.verify(match[1]);
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      if (error instanceof ServiceUnavailableException) throw error;
      if (error instanceof Error && error.message.startsWith('Supabase Auth is not configured')) {
        throw new ServiceUnavailableException('Authentication is not configured.');
      }
      throw new UnauthorizedException('Invalid access token.');
    }

    const user = await this.prisma.internalUser.findUnique({
      where: { authUserId: identity.authUserId },
      select: {
        id: true,
        authUserId: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive || !user.authUserId) {
      throw new ForbiddenException(
        'No active SafeGuard internal account is assigned to this identity.',
      );
    }

    request.internalUser = {
      id: user.id,
      authUserId: user.authUserId,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    };
    return true;
  }
}
