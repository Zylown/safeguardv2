const OWNER_ROLE = 'SUPER_ADMIN' as const;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AdminLinkErrorCode =
  | 'approval_required'
  | 'development_only'
  | 'schema_not_ready'
  | 'invalid_owner_configuration'
  | 'identity_not_found'
  | 'identity_mismatch'
  | 'duplicate_identity'
  | 'duplicate_internal_user'
  | 'owner_already_exists'
  | 'internal_link_conflict'
  | 'transaction_failed';

export class AdminLinkError extends Error {
  constructor(readonly code: AdminLinkErrorCode) {
    super(code);
    this.name = 'AdminLinkError';
  }
}

export interface OwnerBootstrapFlags {
  nodeEnv?: string;
  betterAuthDevEnabled?: string;
  betterAuthSchemaReady?: string;
  totpSchemaReady?: string;
  bootstrapApproved?: string;
  ownerUserId?: string;
  ownerEmail?: string;
}

export interface BetterAuthIdentity {
  id: string;
  email: string;
  name: string;
}

export interface LinkedInternalUser {
  id: string;
  authUserId: string | null;
  betterAuthUserId: string | null;
  email: string;
  fullName: string | null;
  role: string;
  isActive: boolean;
}

export interface AdminLinkTransaction {
  countBetterAuthIdentities(): Promise<number>;
  findBetterAuthIdentities(input: {
    id: string;
    normalizedEmail: string;
  }): Promise<BetterAuthIdentity[]>;
  findInternalUsers(input: {
    betterAuthUserId: string;
    normalizedEmail: string;
  }): Promise<LinkedInternalUser[]>;
  findSuperAdmins(): Promise<LinkedInternalUser[]>;
  createInternalUser(input: {
    betterAuthUserId: string;
    email: string;
    fullName: string | null;
    role: typeof OWNER_ROLE;
    isActive: true;
  }): Promise<LinkedInternalUser>;
}

export interface AdminLinkDatabase {
  transaction<T>(work: (transaction: AdminLinkTransaction) => Promise<T>): Promise<T>;
}

export type OwnerBootstrapResult = 'created' | 'already_linked';

function fail(code: AdminLinkErrorCode): never {
  throw new AdminLinkError(code);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function assertApproved(flags: OwnerBootstrapFlags): void {
  if (flags.nodeEnv !== 'development' || flags.betterAuthDevEnabled !== 'true') {
    fail('development_only');
  }
  if (flags.betterAuthSchemaReady !== 'true' || flags.totpSchemaReady !== 'true') {
    fail('schema_not_ready');
  }
  if (flags.bootstrapApproved !== 'true') {
    fail('approval_required');
  }
}

export async function linkInitialOwner(
  database: AdminLinkDatabase,
  flags: OwnerBootstrapFlags,
): Promise<OwnerBootstrapResult> {
  assertApproved(flags);
  const userId = flags.ownerUserId?.trim() ?? '';
  const normalizedEmail = normalizeEmail(flags.ownerEmail ?? '');
  if (
    !UUID_PATTERN.test(userId) ||
    !normalizedEmail ||
    normalizedEmail.length > 320 ||
    !normalizedEmail.includes('@')
  ) {
    fail('invalid_owner_configuration');
  }

  try {
    return await database.transaction(async (transaction) => {
      if ((await transaction.countBetterAuthIdentities()) !== 1) fail('identity_mismatch');
      const identities = await transaction.findBetterAuthIdentities({
        id: userId,
        normalizedEmail,
      });
      if (identities.length !== 1) {
        fail(identities.length === 0 ? 'identity_not_found' : 'duplicate_identity');
      }
      const identity = identities[0]!;
      if (identity.id !== userId || normalizeEmail(identity.email) !== normalizedEmail) {
        fail('identity_mismatch');
      }

      const internalUsers = await transaction.findInternalUsers({
        betterAuthUserId: userId,
        normalizedEmail,
      });
      if (internalUsers.length > 1) fail('duplicate_internal_user');
      const existing = internalUsers[0];
      const owners = await transaction.findSuperAdmins();
      if (
        owners.length > 0 &&
        (owners.length !== 1 ||
          owners[0]?.betterAuthUserId !== userId ||
          normalizeEmail(owners[0]?.email ?? '') !== normalizedEmail)
      ) {
        fail('owner_already_exists');
      }

      if (existing) {
        const exactOwner =
          existing.betterAuthUserId === userId &&
          normalizeEmail(existing.email) === normalizedEmail &&
          existing.role === OWNER_ROLE &&
          existing.isActive;
        if (!exactOwner) fail('internal_link_conflict');
        return 'already_linked';
      }

      await transaction.createInternalUser({
        betterAuthUserId: userId,
        email: normalizedEmail,
        fullName: identity.name.trim() || null,
        role: OWNER_ROLE,
        isActive: true,
      });
      return 'created';
    });
  } catch (error) {
    if (error instanceof AdminLinkError) throw error;
    throw new AdminLinkError('transaction_failed');
  }
}

export { OWNER_ROLE };
