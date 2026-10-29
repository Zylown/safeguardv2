-- PREPARED ONLY: do not apply until a separately approved deployment window.
-- Adds Better Auth storage to the private safeguard schema while preserving the
-- legacy Supabase auth_user_id column and its unique index for the old guard.

ALTER TABLE "safeguard"."internal_users"
    ADD COLUMN "better_auth_user_id" UUID,
    ALTER COLUMN "auth_user_id" DROP NOT NULL;

CREATE TABLE "safeguard"."user" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "safeguard"."session" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" UUID NOT NULL,
    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "safeguard"."account" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMPTZ(6),
    "refreshTokenExpiresAt" TIMESTAMPTZ(6),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "safeguard"."verification" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "safeguard"."rate_limit" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "lastRequest" BIGINT NOT NULL,
    CONSTRAINT "rate_limit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_email_key" ON "safeguard"."user"("email");
CREATE UNIQUE INDEX "session_token_key" ON "safeguard"."session"("token");
CREATE INDEX "session_userId_idx" ON "safeguard"."session"("userId");
CREATE INDEX "account_userId_idx" ON "safeguard"."account"("userId");
CREATE INDEX "verification_identifier_idx" ON "safeguard"."verification"("identifier");
CREATE UNIQUE INDEX "rate_limit_key_key" ON "safeguard"."rate_limit"("key");
CREATE UNIQUE INDEX "internal_users_better_auth_user_id_key"
    ON "safeguard"."internal_users"("better_auth_user_id");

ALTER TABLE "safeguard"."internal_users"
    ADD CONSTRAINT "internal_users_better_auth_user_id_fkey"
    FOREIGN KEY ("better_auth_user_id") REFERENCES "safeguard"."user"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "safeguard"."session"
    ADD CONSTRAINT "session_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "safeguard"."user"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "safeguard"."account"
    ADD CONSTRAINT "account_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "safeguard"."user"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve the private-schema posture for existing and newly created objects.
REVOKE ALL ON SCHEMA "safeguard" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "safeguard"."internal_users" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "safeguard"."user" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "safeguard"."session" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "safeguard"."account" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "safeguard"."verification" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "safeguard"."rate_limit" FROM PUBLIC, anon, authenticated;
