import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';

loadEnv({ path: '.env' });

async function verifyInternalAccess(): Promise<void> {
  const required = [
    'DATABASE_URL',
    'SUPABASE_URL',
    'SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_TEST_ACCESS_TOKEN',
  ];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Configure required test environment variables: ${missing.join(', ')}.`);
  }

  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api/v1');
  try {
    await app.listen(0, '127.0.0.1');
    const response = await fetch(`${await app.getUrl()}/api/v1/me`, {
      headers: { authorization: `Bearer ${process.env.SUPABASE_TEST_ACCESS_TOKEN}` },
    });
    if (!response.ok) {
      throw new Error(`Internal access integration request returned HTTP ${response.status}.`);
    }

    const payload: unknown = await response.json();
    if (!isInternalUserResponse(payload)) {
      throw new Error('Internal access endpoint returned an unexpected user response.');
    }
    console.log(`Internal access integration check passed for role ${payload.user.role}.`);
  } finally {
    await app.close();
  }
}

function isInternalUserResponse(
  value: unknown,
): value is { user: { email: string; role: 'ADMIN' | 'SALES' | 'OPERATIONS' | 'VIEWER' } } {
  if (typeof value !== 'object' || value === null || !('user' in value)) return false;
  const user = value.user;
  return (
    typeof user === 'object' &&
    user !== null &&
    'email' in user &&
    typeof user.email === 'string' &&
    'role' in user &&
    ['ADMIN', 'SALES', 'OPERATIONS', 'VIEWER'].includes(String(user.role))
  );
}

void verifyInternalAccess().catch((error: unknown) => {
  const errorName = error instanceof Error ? error.name : 'UnknownError';
  console.error(`Internal access integration check failed (${errorName}).`);
  process.exitCode = 1;
});
