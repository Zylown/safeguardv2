import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AdminLinkError,
  linkInitialOwner,
  type AdminLinkDatabase,
  type AdminLinkTransaction,
  type BetterAuthIdentity,
  type LinkedInternalUser,
  type OwnerBootstrapFlags,
} from '../scripts/admin-link.js';

const identity: BetterAuthIdentity = {
  id: '52b6d7ce-7f0e-4a2e-9b4a-8adf9e4d5b37',
  email: 'owner@example.test',
  name: 'Test Owner',
};

const flags: OwnerBootstrapFlags = {
  nodeEnv: 'development',
  betterAuthDevEnabled: 'true',
  betterAuthSchemaReady: 'true',
  totpSchemaReady: 'true',
  bootstrapApproved: 'true',
  ownerUserId: identity.id,
  ownerEmail: identity.email,
};

interface MockOptions {
  identities?: BetterAuthIdentity[];
  identityCount?: number;
  internalUsers?: LinkedInternalUser[];
  transactionFailure?: Error;
}

function makeDatabase(options: MockOptions = {}) {
  const identities = options.identities ?? [identity];
  const internalUsers = [...(options.internalUsers ?? [])];
  const calls = { transactions: 0, creates: 0 };
  const database: AdminLinkDatabase = {
    transaction: async <T>(work: (tx: AdminLinkTransaction) => Promise<T>): Promise<T> => {
      calls.transactions += 1;
      if (options.transactionFailure) throw options.transactionFailure;
      const tx: AdminLinkTransaction = {
        countBetterAuthIdentities: async () => options.identityCount ?? 1,
        findBetterAuthIdentities: async () => identities,
        findInternalUsers: async ({ betterAuthUserId, normalizedEmail }) =>
          internalUsers.filter(
            (user) =>
              user.betterAuthUserId === betterAuthUserId ||
              user.email.toLowerCase() === normalizedEmail,
          ),
        findSuperAdmins: async () => internalUsers.filter((user) => user.role === 'SUPER_ADMIN'),
        createInternalUser: async (record) => {
          calls.creates += 1;
          const created: LinkedInternalUser = {
            id: `internal-${calls.creates}`,
            authUserId: null,
            betterAuthUserId: record.betterAuthUserId,
            email: record.email,
            fullName: record.fullName,
            role: record.role,
            isActive: record.isActive,
          };
          internalUsers.push(created);
          return created;
        },
      };
      return work(tx);
    },
  };
  return { database, calls, internalUsers };
}

async function expectCode(
  database: AdminLinkDatabase,
  input: OwnerBootstrapFlags,
  code: ConstructorParameters<typeof AdminLinkError>[0],
) {
  await assert.rejects(
    linkInitialOwner(database, input),
    (error: unknown) => error instanceof AdminLinkError && error.code === code,
  );
}

test('creates exactly one pinned SUPER_ADMIN and is idempotent', async () => {
  const { database, calls, internalUsers } = makeDatabase();
  assert.equal(await linkInitialOwner(database, flags), 'created');
  assert.equal(await linkInitialOwner(database, flags), 'already_linked');
  assert.equal(calls.creates, 1);
  assert.equal(internalUsers[0]?.role, 'SUPER_ADMIN');
  assert.equal(internalUsers[0]?.isActive, true);
});

test('refuses bootstrap unless the database has exactly one matching identity', async () => {
  const many = makeDatabase({ identityCount: 2 });
  await expectCode(many.database, flags, 'identity_mismatch');
  assert.equal(many.calls.creates, 0);
  const wrongEmail = makeDatabase({ identities: [{ ...identity, email: 'other@example.test' }] });
  await expectCode(wrongEmail.database, flags, 'identity_mismatch');
});

test('never elevates an existing business role or replaces a different owner', async () => {
  const existingAdmin: LinkedInternalUser = {
    id: 'internal-1',
    authUserId: null,
    betterAuthUserId: identity.id,
    email: identity.email,
    fullName: identity.name,
    role: 'ADMIN',
    isActive: true,
  };
  const adminDb = makeDatabase({ internalUsers: [existingAdmin] });
  await expectCode(adminDb.database, flags, 'internal_link_conflict');
  assert.equal(existingAdmin.role, 'ADMIN');
  const otherOwner: LinkedInternalUser = {
    ...existingAdmin,
    betterAuthUserId: 'other-id',
    role: 'SUPER_ADMIN',
  };
  const ownerDb = makeDatabase({ internalUsers: [otherOwner] });
  await expectCode(ownerDb.database, flags, 'owner_already_exists');
});

test('only an exact active SUPER_ADMIN link is an idempotent success', async () => {
  const exact: LinkedInternalUser = {
    id: 'internal-1',
    authUserId: null,
    betterAuthUserId: identity.id,
    email: identity.email,
    fullName: identity.name,
    role: 'SUPER_ADMIN',
    isActive: true,
  };
  const { database, calls } = makeDatabase({ internalUsers: [exact] });
  assert.equal(await linkInitialOwner(database, flags), 'already_linked');
  assert.equal(calls.creates, 0);
});

test('all dev/schema/approval/terminal gates fail before transaction', async () => {
  const cases: Array<[Partial<OwnerBootstrapFlags>, string]> = [
    [{ nodeEnv: 'production' }, 'development_only'],
    [{ betterAuthDevEnabled: 'false' }, 'development_only'],
    [{ betterAuthSchemaReady: 'false' }, 'schema_not_ready'],
    [{ totpSchemaReady: 'false' }, 'schema_not_ready'],
    [{ bootstrapApproved: 'false' }, 'approval_required'],
  ];
  for (const [change, expected] of cases) {
    const { database, calls } = makeDatabase();
    await expectCode(
      database,
      { ...flags, ...change },
      expected as ConstructorParameters<typeof AdminLinkError>[0],
    );
    assert.equal(calls.transactions, 0);
  }
});

test('maps transaction failures to a generic code without retrying', async () => {
  const { database, calls } = makeDatabase({ transactionFailure: new Error('private detail') });
  await expectCode(database, flags, 'transaction_failed');
  assert.equal(calls.transactions, 1);
});
