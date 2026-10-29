-- PREPARED ONLY: review and explicitly approve before applying.
-- Adds the internal CRM baseline in the private safeguard schema.

CREATE TYPE "safeguard"."InquiryStatus" AS ENUM (
    'NEW', 'REVIEWING', 'CONTACTED', 'CLOSED'
);
CREATE TYPE "safeguard"."InquirySource" AS ENUM ('WEBSITE', 'MANUAL');
CREATE TYPE "safeguard"."InquiryLocale" AS ENUM ('EN', 'ES');
CREATE TYPE "safeguard"."OpportunityStage" AS ENUM (
    'NEW', 'QUALIFIED', 'QUOTATION', 'NEGOTIATION', 'WON', 'LOST'
);
CREATE TYPE "safeguard"."ActivityType" AS ENUM ('NOTE', 'CALL', 'MEETING', 'TASK');
CREATE TYPE "safeguard"."ActivityTaskStatus" AS ENUM ('OPEN', 'COMPLETED', 'CANCELED');

-- PostgreSQL grants USAGE on new data types to PUBLIC by default; keep these private too.
REVOKE USAGE ON TYPE
    "safeguard"."InquiryStatus",
    "safeguard"."InquirySource",
    "safeguard"."InquiryLocale",
    "safeguard"."OpportunityStage",
    "safeguard"."ActivityType",
    "safeguard"."ActivityTaskStatus"
FROM PUBLIC, anon, authenticated;

CREATE TABLE "safeguard"."crm_companies" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "name" VARCHAR(200) NOT NULL,
    "legal_name" VARCHAR(240),
    "website_url" VARCHAR(2048),
    "country_code" CHAR(2),
    "city" VARCHAR(120),
    "industry" VARCHAR(160),
    "notes" TEXT,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "crm_companies_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "crm_companies_country_code_check" CHECK ("country_code" IS NULL OR "country_code" ~ '^[A-Z]{2}$')
);

CREATE TABLE "safeguard"."crm_contacts" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "first_name" VARCHAR(120) NOT NULL,
    "last_name" VARCHAR(120),
    "email" VARCHAR(320),
    "phone" VARCHAR(64),
    "job_title" VARCHAR(160),
    "notes" TEXT,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "crm_contacts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "crm_contacts_company_id_fkey" FOREIGN KEY ("company_id")
        REFERENCES "safeguard"."crm_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "safeguard"."crm_opportunities" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "contact_id" UUID,
    "owner_id" UUID,
    "name" VARCHAR(200) NOT NULL,
    "stage" "safeguard"."OpportunityStage" NOT NULL DEFAULT 'NEW',
    "estimated_amount" DECIMAL(14,2),
    "currency_code" CHAR(3),
    "follow_up_at" TIMESTAMPTZ(6),
    "notes" TEXT,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "crm_opportunities_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "crm_opportunities_company_id_fkey" FOREIGN KEY ("company_id")
        REFERENCES "safeguard"."crm_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "crm_opportunities_contact_id_fkey" FOREIGN KEY ("contact_id")
        REFERENCES "safeguard"."crm_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "crm_opportunities_owner_id_fkey" FOREIGN KEY ("owner_id")
        REFERENCES "safeguard"."internal_users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "crm_opportunities_amount_currency_check" CHECK (
        ("estimated_amount" IS NULL AND "currency_code" IS NULL)
        OR (
            "estimated_amount" IS NOT NULL
            AND "currency_code" IS NOT NULL
            AND "estimated_amount" >= 0
            AND "currency_code" ~ '^[A-Z]{3}$'
        )
    )
);

CREATE TABLE "safeguard"."crm_inquiries" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "source" "safeguard"."InquirySource" NOT NULL DEFAULT 'MANUAL',
    "status" "safeguard"."InquiryStatus" NOT NULL DEFAULT 'NEW',
    "locale" "safeguard"."InquiryLocale",
    "company_name" VARCHAR(200),
    "contact_name" VARCHAR(240),
    "email" VARCHAR(320),
    "country_code" CHAR(2),
    "phone" VARCHAR(64),
    "product_name" VARCHAR(200),
    "product_reference" VARCHAR(160),
    "quantity" DECIMAL(12,3),
    "message" TEXT NOT NULL,
    "company_id" UUID,
    "contact_id" UUID,
    "opportunity_id" UUID,
    "created_by_id" UUID,
    "closed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "crm_inquiries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "crm_inquiries_quantity_check" CHECK ("quantity" IS NULL OR "quantity" > 0),
    CONSTRAINT "crm_inquiries_country_code_check" CHECK ("country_code" IS NULL OR "country_code" ~ '^[A-Z]{2}$'),
    CONSTRAINT "crm_inquiries_company_id_fkey" FOREIGN KEY ("company_id")
        REFERENCES "safeguard"."crm_companies"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "crm_inquiries_contact_id_fkey" FOREIGN KEY ("contact_id")
        REFERENCES "safeguard"."crm_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "crm_inquiries_opportunity_id_fkey" FOREIGN KEY ("opportunity_id")
        REFERENCES "safeguard"."crm_opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "crm_inquiries_created_by_id_fkey" FOREIGN KEY ("created_by_id")
        REFERENCES "safeguard"."internal_users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "safeguard"."crm_activities" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "type" "safeguard"."ActivityType" NOT NULL,
    "description" VARCHAR(4000) NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "task_due_at" TIMESTAMPTZ(6),
    "task_status" "safeguard"."ActivityTaskStatus",
    "company_id" UUID,
    "opportunity_id" UUID,
    "inquiry_id" UUID,
    "author_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "crm_activities_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "crm_activities_task_status_check" CHECK (
        ("type" = 'TASK' AND "task_status" IS NOT NULL)
        OR ("type" <> 'TASK' AND "task_status" IS NULL)
    ),
    CONSTRAINT "crm_activities_task_due_check" CHECK ("type" = 'TASK' OR "task_due_at" IS NULL),
    CONSTRAINT "crm_activities_company_id_fkey" FOREIGN KEY ("company_id")
        REFERENCES "safeguard"."crm_companies"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "crm_activities_opportunity_id_fkey" FOREIGN KEY ("opportunity_id")
        REFERENCES "safeguard"."crm_opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "crm_activities_inquiry_id_fkey" FOREIGN KEY ("inquiry_id")
        REFERENCES "safeguard"."crm_inquiries"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "crm_activities_author_id_fkey" FOREIGN KEY ("author_id")
        REFERENCES "safeguard"."internal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "crm_companies_name_idx" ON "safeguard"."crm_companies"("name");
CREATE INDEX "crm_companies_country_code_idx" ON "safeguard"."crm_companies"("country_code");
CREATE INDEX "crm_companies_archived_at_created_at_idx" ON "safeguard"."crm_companies"("archived_at", "created_at");
CREATE INDEX "crm_contacts_company_id_archived_at_last_name_first_name_idx" ON "safeguard"."crm_contacts"("company_id", "archived_at", "last_name", "first_name");
CREATE INDEX "crm_contacts_email_idx" ON "safeguard"."crm_contacts"("email");
CREATE INDEX "crm_opportunities_stage_created_at_idx" ON "safeguard"."crm_opportunities"("stage", "created_at");
CREATE INDEX "crm_opportunities_company_id_archived_at_created_at_idx" ON "safeguard"."crm_opportunities"("company_id", "archived_at", "created_at");
CREATE INDEX "crm_opportunities_owner_id_follow_up_at_idx" ON "safeguard"."crm_opportunities"("owner_id", "follow_up_at");
CREATE INDEX "crm_inquiries_status_created_at_idx" ON "safeguard"."crm_inquiries"("status", "created_at");
CREATE INDEX "crm_inquiries_source_created_at_idx" ON "safeguard"."crm_inquiries"("source", "created_at");
CREATE INDEX "crm_inquiries_email_created_at_idx" ON "safeguard"."crm_inquiries"("email", "created_at");
CREATE INDEX "crm_inquiries_company_id_created_at_idx" ON "safeguard"."crm_inquiries"("company_id", "created_at");
CREATE INDEX "crm_inquiries_contact_id_idx" ON "safeguard"."crm_inquiries"("contact_id");
CREATE INDEX "crm_inquiries_opportunity_id_idx" ON "safeguard"."crm_inquiries"("opportunity_id");
CREATE INDEX "crm_activities_company_id_occurred_at_idx" ON "safeguard"."crm_activities"("company_id", "occurred_at");
CREATE INDEX "crm_activities_opportunity_id_occurred_at_idx" ON "safeguard"."crm_activities"("opportunity_id", "occurred_at");
CREATE INDEX "crm_activities_inquiry_id_occurred_at_idx" ON "safeguard"."crm_activities"("inquiry_id", "occurred_at");
CREATE INDEX "crm_activities_author_id_occurred_at_idx" ON "safeguard"."crm_activities"("author_id", "occurred_at");
CREATE INDEX "crm_activities_type_task_status_task_due_at_idx" ON "safeguard"."crm_activities"("type", "task_status", "task_due_at");

-- Preserve case-insensitive duplicate prevention while allowing archived records to remain as history.
CREATE UNIQUE INDEX "crm_companies_active_name_lower_key" ON "safeguard"."crm_companies"(lower("name")) WHERE "archived_at" IS NULL;
CREATE UNIQUE INDEX "crm_contacts_active_company_email_lower_key" ON "safeguard"."crm_contacts"("company_id", lower("email")) WHERE "email" IS NOT NULL AND "archived_at" IS NULL;

REVOKE ALL ON TABLE
    "safeguard"."crm_companies",
    "safeguard"."crm_contacts",
    "safeguard"."crm_inquiries",
    "safeguard"."crm_opportunities",
    "safeguard"."crm_activities"
FROM PUBLIC, anon, authenticated;
