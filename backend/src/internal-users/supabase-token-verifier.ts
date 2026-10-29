import {
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { JwtPayload } from '@supabase/supabase-js';

export const SUPABASE_CLIENT_FACTORY = Symbol('SUPABASE_CLIENT_FACTORY');

export type SupabaseClientFactory = (url: string, key: string) => SupabaseClient;

export interface VerifiedSupabaseIdentity {
  authUserId: string;
  email: string | null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class SupabaseTokenVerifier {
  private client?: SupabaseClient;

  constructor(
    @Inject(SUPABASE_CLIENT_FACTORY)
    private readonly clientFactory: SupabaseClientFactory = (url, key) =>
      createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      }),
  ) {}

  async verify(token: string): Promise<VerifiedSupabaseIdentity> {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) {
      throw new Error(
        'Supabase Auth is not configured. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.',
      );
    }

    this.client ??= this.clientFactory(url, key);
    let result;
    try {
      result = await this.client.auth.getClaims(token);
    } catch {
      throw new ServiceUnavailableException('Supabase Auth could not verify the access token.');
    }
    const { data, error } = result;
    const claims = data?.claims;

    if (
      error ||
      !claims ||
      !this.hasValidIssuer(claims, url) ||
      !this.hasValidAudience(claims.aud)
    ) {
      throw new UnauthorizedException('Invalid access token.');
    }

    if (
      typeof claims.sub !== 'string' ||
      !UUID_PATTERN.test(claims.sub) ||
      typeof claims.exp !== 'number' ||
      claims.exp <= Math.floor(Date.now() / 1000)
    ) {
      throw new UnauthorizedException('Invalid access token.');
    }

    return {
      authUserId: claims.sub,
      email: typeof claims.email === 'string' ? claims.email : null,
    };
  }

  private hasValidIssuer(claims: JwtPayload, supabaseUrl: string): boolean {
    try {
      const expectedIssuer = new URL('/auth/v1', supabaseUrl).toString().replace(/\/$/, '');
      return claims.iss === expectedIssuer;
    } catch {
      return false;
    }
  }

  private hasValidAudience(audience: JwtPayload['aud']): boolean {
    return Array.isArray(audience)
      ? audience.includes('authenticated')
      : audience === 'authenticated';
  }
}
