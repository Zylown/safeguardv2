import { Module } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import { PrismaModule } from '../prisma/prisma.module';
import { InternalUserGuard } from './internal-user.guard';
import { InternalUsersController } from './internal-users.controller';
import { SUPABASE_CLIENT_FACTORY, SupabaseTokenVerifier } from './supabase-token-verifier';
import { BetterAuthInternalUsersController } from './better-auth-internal-users.controller';
import { BetterAuthInternalUserGuard } from './better-auth-internal-user.guard';

@Module({
  imports: [PrismaModule],
  controllers: [InternalUsersController, BetterAuthInternalUsersController],
  providers: [
    SupabaseTokenVerifier,
    InternalUserGuard,
    BetterAuthInternalUserGuard,
    {
      provide: SUPABASE_CLIENT_FACTORY,
      useValue: (url: string, key: string) =>
        createClient(url, key, {
          auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
        }),
    },
  ],
  exports: [BetterAuthInternalUserGuard],
})
export class InternalUsersModule {}
