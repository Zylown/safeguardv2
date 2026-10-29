-- PREPARED ONLY: this migration has not been applied.
-- Adds only the fields required by Better Auth's Admin plugin to the private
-- identity tables created by 20261015160000_better_auth_identity.
-- Better Auth's `role` is an identity-management role, not InternalRole.

ALTER TABLE "safeguard"."user"
    ADD COLUMN "banExpires" TIMESTAMPTZ(6),
    ADD COLUMN "banReason" TEXT,
    ADD COLUMN "banned" BOOLEAN DEFAULT false,
    ADD COLUMN "role" TEXT;

ALTER TABLE "safeguard"."session"
    ADD COLUMN "impersonatedBy" TEXT;

-- Preserve the private-schema privilege boundary for the affected tables.
REVOKE ALL ON TABLE "safeguard"."user" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "safeguard"."session" FROM PUBLIC, anon, authenticated;
