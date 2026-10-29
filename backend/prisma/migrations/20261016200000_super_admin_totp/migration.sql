-- Candidate only: do not apply until the owner explicitly approves the database operation.
-- Adds the business SUPER_ADMIN role and Better Auth 1.7.10 TOTP schema.
-- Better Auth's technical plugin role remains separate from safeguard.InternalRole.

ALTER TYPE "safeguard"."InternalRole" ADD VALUE 'SUPER_ADMIN';

ALTER TABLE "safeguard"."user"
  ADD COLUMN "twoFactorEnabled" BOOLEAN DEFAULT false,
  ADD COLUMN "two_factor_enabled_at" TIMESTAMPTZ(6);

CREATE TABLE "safeguard"."twoFactor" (
  "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  "secret" TEXT NOT NULL,
  "backupCodes" TEXT NOT NULL,
  "userId" UUID NOT NULL,
  "verified" BOOLEAN DEFAULT true,
  "failedVerificationCount" INTEGER DEFAULT 0,
  "lockedUntil" TIMESTAMPTZ(6),
  CONSTRAINT "twoFactor_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "twoFactor_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "safeguard"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "twoFactor_secret_idx" ON "safeguard"."twoFactor"("secret");
CREATE INDEX "twoFactor_userId_idx" ON "safeguard"."twoFactor"("userId");

REVOKE ALL ON TABLE "safeguard"."twoFactor" FROM PUBLIC, anon, authenticated;
