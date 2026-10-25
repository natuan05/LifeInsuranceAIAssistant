BEGIN;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "business";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "rag";

-- CreateEnum
CREATE TYPE "business"."UserRole" AS ENUM ('CUSTOMER', 'STAFF');

-- CreateEnum
CREATE TYPE "business"."AccountStatus" AS ENUM ('ACTIVE', 'LOCKED');

-- CreateEnum
CREATE TYPE "business"."AccessScope" AS ENUM ('PUBLIC', 'PRIVATE_POLICY');

-- CreateEnum
CREATE TYPE "business"."ContractStatus" AS ENUM ('ACTIVE', 'LAPSED', 'MATURED', 'PENDING');

-- CreateEnum
CREATE TYPE "business"."PaymentFrequency" AS ENUM ('ANNUAL', 'SEMI_ANNUAL', 'QUARTERLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "business"."ConversationChannel" AS ENUM ('CUSTOMER_SUPPORT', 'STAFF_COPILOT');

-- CreateEnum
CREATE TYPE "business"."ConversationStatus" AS ENUM ('AI_ACTIVE', 'PENDING_HANDOFF', 'STAFF_ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "business"."SenderType" AS ENUM ('CUSTOMER', 'STAFF', 'AI_AGENT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "business"."TicketStatus" AS ENUM ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "business"."OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED_DLQ');

-- CreateTable
CREATE TABLE "business"."users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "account_code" VARCHAR(32) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "phone" VARCHAR(20),
    "password_hash" VARCHAR(255) NOT NULL,
    "role" "business"."UserRole" NOT NULL,
    "status" "business"."AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "password_change_recommended" BOOLEAN NOT NULL DEFAULT true,
    "password_changed_at" TIMESTAMPTZ(3),
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business"."customer_profiles" (
    "user_id" UUID NOT NULL,
    "role" "business"."UserRole" NOT NULL DEFAULT 'CUSTOMER',
    "citizen_id" VARCHAR(20),
    "full_name" VARCHAR(255) NOT NULL,
    "birth" DATE,
    "address" TEXT,
    "assignment_version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "customer_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "business"."staff_profiles" (
    "user_id" UUID NOT NULL,
    "role" "business"."UserRole" NOT NULL DEFAULT 'STAFF',
    "full_name" VARCHAR(255) NOT NULL,
    "department" VARCHAR(100),

    CONSTRAINT "staff_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "business"."staff_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "staff_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(3),
    "operator_id" VARCHAR(100) NOT NULL,

    CONSTRAINT "staff_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business"."auth_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "csrf_token_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business"."admin_requests" (
    "request_id" UUID NOT NULL,
    "operator_id" VARCHAR(100) NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "fingerprint" CHAR(64) NOT NULL,
    "result_ids" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_requests_pkey" PRIMARY KEY ("request_id")
);

-- CreateTable
CREATE TABLE "business"."rate_limit_buckets" (
    "client_token" VARCHAR(255) NOT NULL,
    "endpoint_group" VARCHAR(50) NOT NULL,
    "window_start" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "request_count" INTEGER NOT NULL DEFAULT 0,
    "blocked_until" TIMESTAMPTZ(3),

    CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("client_token","endpoint_group")
);

-- CreateTable
CREATE TABLE "business"."audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_id" UUID,
    "actor_type" VARCHAR(20) NOT NULL,
    "actor_role" VARCHAR(50),
    "operator_id" VARCHAR(100),
    "action" VARCHAR(100) NOT NULL,
    "target_type" VARCHAR(100),
    "target_id" UUID,
    "outcome" VARCHAR(20) NOT NULL,
    "request_id" UUID NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business"."insurance_products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "summary" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "insurance_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business"."insurance_contracts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "policy_number" VARCHAR(100) NOT NULL,
    "customer_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "status" "business"."ContractStatus" NOT NULL,
    "premium_amount" DECIMAL(15,2),
    "payment_frequency" "business"."PaymentFrequency",
    "next_due_date" DATE,
    "effective_date" DATE,
    "expiry_date" DATE,
    "sum_assured" DECIMAL(15,2),
    "benefits_snapshot" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "insurance_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business"."documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" VARCHAR(255) NOT NULL,
    "access_scope" "business"."AccessScope" NOT NULL,
    "product_id" UUID,
    "policy_id" UUID,
    "owner_customer_id" UUID,
    "current_version" VARCHAR(20),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business"."document_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "document_id" UUID NOT NULL,
    "version_number" VARCHAR(20) NOT NULL,
    "storage_bucket" VARCHAR(100) NOT NULL,
    "storage_object_key" TEXT NOT NULL,
    "checksum_sha256" CHAR(64) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business"."conversations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "channel_type" "business"."ConversationChannel" NOT NULL,
    "customer_id" UUID NOT NULL,
    "assigned_staff_id" UUID,
    "linked_context_conv_id" UUID,
    "linked_policy_id" UUID,
    "status" "business"."ConversationStatus" NOT NULL,
    "ai_summary" TEXT,
    "draft_ticket_payload" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business"."messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID NOT NULL,
    "sender_type" "business"."SenderType" NOT NULL,
    "sender_id" UUID,
    "content" TEXT NOT NULL,
    "citations" JSONB,
    "tool_calls_metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business"."support_tickets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ticket_code" VARCHAR(50) NOT NULL,
    "conversation_id" UUID,
    "customer_id" UUID NOT NULL,
    "assigned_staff_id" UUID,
    "policy_id" UUID,
    "title" VARCHAR(255) NOT NULL,
    "ai_summary" TEXT,
    "extracted_details" JSONB,
    "status" "business"."TicketStatus" NOT NULL,
    "idempotency_key" VARCHAR(255) NOT NULL,
    "confirmed_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business"."outbox_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "aggregate_type" VARCHAR(50) NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "business"."OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business"."notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "recipient_staff_id" UUID NOT NULL,
    "ticket_id" UUID,
    "conversation_id" UUID,
    "title" VARCHAR(255) NOT NULL,
    "body" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "dedup_key" VARCHAR(255) NOT NULL,
    "delivered_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rag"."rag_knowledge_chunks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "document_id" UUID NOT NULL,
    "document_version" VARCHAR(20) NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" public.vector NOT NULL,
    "access_scope" VARCHAR(50) NOT NULL,
    "product_id" UUID,
    "policy_id" UUID,
    "owner_customer_id" UUID,
    "page_number" INTEGER,
    "metadata" JSONB,

    CONSTRAINT "rag_knowledge_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_account_code_key" ON "business"."users"("account_code");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "business"."users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "business"."users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_id_role_key" ON "business"."users"("id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "customer_profiles_citizen_id_key" ON "business"."customer_profiles"("citizen_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_profiles_user_id_role_key" ON "business"."customer_profiles"("user_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "staff_profiles_user_id_role_key" ON "business"."staff_profiles"("user_id", "role");

-- CreateIndex
CREATE INDEX "staff_assignments_staff_id_is_active_idx" ON "business"."staff_assignments"("staff_id", "is_active");

-- CreateIndex
CREATE INDEX "staff_assignments_customer_id_assigned_at_idx" ON "business"."staff_assignments"("customer_id", "assigned_at");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_token_hash_key" ON "business"."auth_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "auth_sessions_user_id_revoked_at_idx" ON "business"."auth_sessions"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "auth_sessions_expires_at_idx" ON "business"."auth_sessions"("expires_at");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "business"."audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "audit_logs_target_type_target_id_idx" ON "business"."audit_logs"("target_type", "target_id");

-- CreateIndex
CREATE UNIQUE INDEX "insurance_products_product_code_key" ON "business"."insurance_products"("product_code");

-- CreateIndex
CREATE UNIQUE INDEX "insurance_contracts_policy_number_key" ON "business"."insurance_contracts"("policy_number");

-- CreateIndex
CREATE INDEX "insurance_contracts_customer_id_idx" ON "business"."insurance_contracts"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "insurance_contracts_id_customer_id_key" ON "business"."insurance_contracts"("id", "customer_id");

-- CreateIndex
CREATE INDEX "documents_owner_customer_id_idx" ON "business"."documents"("owner_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_versions_document_id_version_number_key" ON "business"."document_versions"("document_id", "version_number");

-- CreateIndex
CREATE INDEX "conversations_customer_id_created_at_idx" ON "business"."conversations"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "messages_conversation_id_created_at_idx" ON "business"."messages"("conversation_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "support_tickets_ticket_code_key" ON "business"."support_tickets"("ticket_code");

-- CreateIndex
CREATE UNIQUE INDEX "support_tickets_idempotency_key_key" ON "business"."support_tickets"("idempotency_key");

-- CreateIndex
CREATE INDEX "support_tickets_customer_id_created_at_idx" ON "business"."support_tickets"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "outbox_events_status_next_attempt_at_idx" ON "business"."outbox_events"("status", "next_attempt_at");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_dedup_key_key" ON "business"."notifications"("dedup_key");

-- CreateIndex
CREATE INDEX "notifications_recipient_staff_id_is_read_created_at_idx" ON "business"."notifications"("recipient_staff_id", "is_read", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "rag_knowledge_chunks_document_id_document_version_chunk_ind_key" ON "rag"."rag_knowledge_chunks"("document_id", "document_version", "chunk_index");

-- AddForeignKey
ALTER TABLE "business"."customer_profiles" ADD CONSTRAINT "customer_profiles_user_id_role_fkey" FOREIGN KEY ("user_id", "role") REFERENCES "business"."users"("id", "role") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business"."staff_profiles" ADD CONSTRAINT "staff_profiles_user_id_role_fkey" FOREIGN KEY ("user_id", "role") REFERENCES "business"."users"("id", "role") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business"."staff_assignments" ADD CONSTRAINT "staff_assignments_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "business"."staff_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business"."staff_assignments" ADD CONSTRAINT "staff_assignments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "business"."customer_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business"."auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "business"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business"."audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "business"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business"."insurance_contracts" ADD CONSTRAINT "insurance_contracts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "business"."customer_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business"."insurance_contracts" ADD CONSTRAINT "insurance_contracts_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "business"."insurance_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business"."documents" ADD CONSTRAINT "documents_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "business"."insurance_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business"."documents" ADD CONSTRAINT "documents_policy_id_owner_customer_id_fkey" FOREIGN KEY ("policy_id", "owner_customer_id") REFERENCES "business"."insurance_contracts"("id", "customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business"."documents" ADD CONSTRAINT "documents_owner_customer_id_fkey" FOREIGN KEY ("owner_customer_id") REFERENCES "business"."customer_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business"."documents" ADD CONSTRAINT "documents_id_current_version_fkey" FOREIGN KEY ("id", "current_version") REFERENCES "business"."document_versions"("document_id", "version_number") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "business"."document_versions" ADD CONSTRAINT "document_versions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "business"."documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business"."conversations" ADD CONSTRAINT "conversations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "business"."customer_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business"."conversations" ADD CONSTRAINT "conversations_assigned_staff_id_fkey" FOREIGN KEY ("assigned_staff_id") REFERENCES "business"."staff_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business"."conversations" ADD CONSTRAINT "conversations_linked_policy_id_customer_id_fkey" FOREIGN KEY ("linked_policy_id", "customer_id") REFERENCES "business"."insurance_contracts"("id", "customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business"."conversations" ADD CONSTRAINT "conversations_linked_context_conv_id_fkey" FOREIGN KEY ("linked_context_conv_id") REFERENCES "business"."conversations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "business"."messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "business"."conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business"."messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "business"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business"."support_tickets" ADD CONSTRAINT "support_tickets_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "business"."conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business"."support_tickets" ADD CONSTRAINT "support_tickets_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "business"."customer_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business"."support_tickets" ADD CONSTRAINT "support_tickets_assigned_staff_id_fkey" FOREIGN KEY ("assigned_staff_id") REFERENCES "business"."staff_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business"."support_tickets" ADD CONSTRAINT "support_tickets_policy_id_customer_id_fkey" FOREIGN KEY ("policy_id", "customer_id") REFERENCES "business"."insurance_contracts"("id", "customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business"."notifications" ADD CONSTRAINT "notifications_recipient_staff_id_fkey" FOREIGN KEY ("recipient_staff_id") REFERENCES "business"."staff_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business"."notifications" ADD CONSTRAINT "notifications_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "business"."support_tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business"."notifications" ADD CONSTRAINT "notifications_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "business"."conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
