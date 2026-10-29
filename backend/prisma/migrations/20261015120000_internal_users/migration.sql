-- SafeGuard-managed schema is separate from Supabase's exposed `public` schema.
-- Before applying, confirm `safeguard` is not listed in Supabase Data API exposed schemas.
CREATE SCHEMA "safeguard";
REVOKE ALL ON SCHEMA "safeguard" FROM PUBLIC, anon, authenticated;

CREATE TYPE "safeguard"."InternalRole" AS ENUM (
    'ADMIN',
    'SALES',
    'OPERATIONS',
    'VIEWER'
);

CREATE TABLE "safeguard"."internal_users" (
    "id" UUID NOT NULL,
    "auth_user_id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "full_name" VARCHAR(200),
    "role" "safeguard"."InternalRole" NOT NULL DEFAULT 'VIEWER',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "internal_users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "internal_users_auth_user_id_key"
    ON "safeguard"."internal_users"("auth_user_id");

REVOKE ALL ON TABLE "safeguard"."internal_users" FROM PUBLIC, anon, authenticated;
