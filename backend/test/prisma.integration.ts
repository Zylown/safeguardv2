import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import { PrismaService } from '../src/prisma/prisma.service';

// Use the workspace .env first and the repository .env as a fallback.
loadEnv({ path: '.env' });

async function verifyDatabaseConnection(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured; set it in backend/.env.');
  }

  const prisma = new PrismaService();
  try {
    const result = await prisma.$queryRaw<Array<{ result: number }>>`SELECT 1 AS result`;
    if (result.length !== 1 || result[0]?.result !== 1) {
      throw new Error('Database returned an unexpected result for SELECT 1.');
    }
    console.log('Prisma PostgreSQL integration check passed: SELECT 1 returned 1.');
  } finally {
    await prisma.$disconnect();
  }
}

void verifyDatabaseConnection().catch((error: unknown) => {
  const safeError = error as { code?: string; name?: string };
  console.error(
    'Prisma PostgreSQL integration check failed:',
    safeError.code ?? safeError.name ?? 'unknown error',
  );
  process.exitCode = 1;
});
