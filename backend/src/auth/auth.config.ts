import { betterAuth } from 'better-auth';
import type { BetterAuthOptions } from 'better-auth';
import { twoFactor } from 'better-auth/plugins';
import { prismaAdapter } from '@better-auth/prisma-adapter';

import { isBetterAuthDevelopmentEnabled } from './feature-flag';

const instances = new WeakMap<object, ReturnType<typeof betterAuth>>();

export function getSafeGuardAuth(prisma: Parameters<typeof prismaAdapter>[0]) {
  let instance = instances.get(prisma);
  if (!instance) {
    instance = createSafeGuardAuth(prisma);
    instances.set(prisma, instance);
  }
  return instance;
}

export { isBetterAuthDevelopmentEnabled };

export function createSafeGuardAuth(
  prisma: Parameters<typeof prismaAdapter>[0],
): ReturnType<typeof betterAuth> {
  if (!process.env.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET.length < 32) {
    throw new Error('BETTER_AUTH_SECRET must be configured with at least 32 characters.');
  }

  const baseURL = process.env.BETTER_AUTH_URL;
  if (!baseURL) throw new Error('BETTER_AUTH_URL must be configured when Better Auth is enabled.');

  const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
  const isProduction = process.env.NODE_ENV === 'production';
  const configuredUrl = new URL(baseURL);
  const configuredOrigin = new URL(webOrigin);
  if (configuredUrl.origin !== configuredOrigin.origin) {
    throw new Error('BETTER_AUTH_URL must use the same origin as WEB_ORIGIN.');
  }
  if (isProduction && configuredUrl.protocol !== 'https:') {
    throw new Error('BETTER_AUTH_URL must use HTTPS in production.');
  }
  const twoFactorSchemaReady =
    process.env.NODE_ENV === 'development' &&
    process.env.BETTER_AUTH_DEV_ENABLED === 'true' &&
    process.env.BETTER_AUTH_SCHEMA_READY === 'true' &&
    process.env.BETTER_AUTH_TOTP_SCHEMA_READY === 'true';

  const authOptions: BetterAuthOptions = {
    appName: 'SafeGuard',
    baseURL,
    basePath: '/api/auth',
    secret: process.env.BETTER_AUTH_SECRET,
    trustedOrigins: [webOrigin],
    database: prismaAdapter(prisma, { provider: 'postgresql', transaction: true }),
    ...(twoFactorSchemaReady
      ? {
          plugins: [
            twoFactor({
              issuer: 'SafeGuard',
              skipVerificationOnEnable: false,
              trustDeviceMaxAge: 0,
              twoFactorCookieMaxAge: 10 * 60,
            }),
          ],
          user: {
            additionalFields: {
              twoFactorEnabledAt: {
                type: 'date' as const,
                required: false,
                input: false,
              },
            },
          },
          databaseHooks: {
            user: {
              update: {
                before: async (userData: Record<string, unknown>) => {
                  if (
                    userData.twoFactorEnabled === true &&
                    !(userData.twoFactorEnabledAt instanceof Date)
                  ) {
                    return { data: { ...userData, twoFactorEnabledAt: new Date() } };
                  }
                  return { data: userData };
                },
              },
            },
          },
        }
      : {}),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
    },
    session: {
      expiresIn: 8 * 60 * 60,
      updateAge: 60 * 60,
      cookieCache: { enabled: false },
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      modelName: 'rateLimit',
      window: 60,
      max: 60,
      customRules: {
        '/sign-in/email': { window: 60, max: 5 },
      },
    },
    advanced: {
      cookiePrefix: 'safeguard-auth',
      useSecureCookies: isProduction,
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: 'lax',
        secure: isProduction,
      },
      disableCSRFCheck: false,
      disableOriginCheck: false,
      database: { generateId: 'uuid' },
    },
  };
  return betterAuth(authOptions);
}
