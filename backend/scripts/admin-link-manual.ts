import type { Prisma, PrismaClient } from '../src/generated/prisma/client.js';
import {
  AdminLinkError,
  linkInitialOwner,
  type AdminLinkDatabase,
  type AdminLinkTransaction,
  type BetterAuthIdentity,
  type LinkedInternalUser,
} from './admin-link.js';

function requireManualGates(): void {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new AdminLinkError('approval_required');
  if (process.env.NODE_ENV !== 'development' || process.env.BETTER_AUTH_DEV_ENABLED !== 'true') {
    throw new AdminLinkError('development_only');
  }
}

function prismaDatabase(
  client: PrismaClient,
  serializable: Prisma.TransactionIsolationLevel,
): AdminLinkDatabase {
  return {
    transaction: (work) =>
      client.$transaction(
        async (tx) => {
          const transaction: AdminLinkTransaction = {
            async countBetterAuthIdentities() {
              return tx.user.count();
            },
            async findBetterAuthIdentities({ id, normalizedEmail }) {
              return (await tx.user.findMany({
                where: {
                  OR: [{ id }, { email: { equals: normalizedEmail, mode: 'insensitive' } }],
                },
                select: { id: true, email: true, name: true },
              })) as BetterAuthIdentity[];
            },
            async findInternalUsers({ betterAuthUserId, normalizedEmail }) {
              return (await tx.internalUser.findMany({
                where: {
                  OR: [
                    { betterAuthUserId },
                    { email: { equals: normalizedEmail, mode: 'insensitive' } },
                  ],
                },
                select: {
                  id: true,
                  authUserId: true,
                  betterAuthUserId: true,
                  email: true,
                  fullName: true,
                  role: true,
                  isActive: true,
                },
              })) as LinkedInternalUser[];
            },
            async findSuperAdmins() {
              return (await tx.internalUser.findMany({
                where: { role: 'SUPER_ADMIN' },
                select: {
                  id: true,
                  authUserId: true,
                  betterAuthUserId: true,
                  email: true,
                  fullName: true,
                  role: true,
                  isActive: true,
                },
              })) as LinkedInternalUser[];
            },
            async createInternalUser(data) {
              return (await tx.internalUser.create({ data })) as LinkedInternalUser;
            },
          };
          return work(transaction);
        },
        { isolationLevel: serializable, maxWait: 5_000, timeout: 10_000 },
      ),
  };
}

async function main(): Promise<void> {
  requireManualGates();
  let prismaClient: PrismaClient | undefined;

  try {
    const [{ Prisma }, { prisma }] = await Promise.all([
      import('../src/generated/prisma/client.js'),
      import('./owner-bootstrap-db.js'),
    ]);
    prismaClient = prisma;
    const result = await linkInitialOwner(
      prismaDatabase(prismaClient, Prisma.TransactionIsolationLevel.Serializable),
      {
        ...(process.env.NODE_ENV === undefined ? {} : { nodeEnv: process.env.NODE_ENV }),
        ...(process.env.BETTER_AUTH_DEV_ENABLED === undefined
          ? {}
          : { betterAuthDevEnabled: process.env.BETTER_AUTH_DEV_ENABLED }),
        ...(process.env.BETTER_AUTH_SCHEMA_READY === undefined
          ? {}
          : { betterAuthSchemaReady: process.env.BETTER_AUTH_SCHEMA_READY }),
        ...(process.env.BETTER_AUTH_TOTP_SCHEMA_READY === undefined
          ? {}
          : { totpSchemaReady: process.env.BETTER_AUTH_TOTP_SCHEMA_READY }),
        ...(process.env.INITIAL_OWNER_BOOTSTRAP_APPROVED === undefined
          ? {}
          : { bootstrapApproved: process.env.INITIAL_OWNER_BOOTSTRAP_APPROVED }),
        ...(process.env.INITIAL_OWNER_BETTER_AUTH_USER_ID === undefined
          ? {}
          : { ownerUserId: process.env.INITIAL_OWNER_BETTER_AUTH_USER_ID }),
        ...(process.env.INITIAL_OWNER_EMAIL === undefined
          ? {}
          : { ownerEmail: process.env.INITIAL_OWNER_EMAIL }),
      },
    );
    console.log(
      result === 'created' ? 'Owner SUPER_ADMIN link created.' : 'Exact owner link already exists.',
    );
  } finally {
    await prismaClient?.$disconnect();
  }
}

main().catch((error: unknown) => {
  const code = error instanceof AdminLinkError ? error.code : 'transaction_failed';
  console.error(`Owner bootstrap was not completed (${code}).`);
  process.exitCode = 1;
});
