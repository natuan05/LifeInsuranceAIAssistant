BEGIN;

-- Handwritten invariants not fully expressible in Prisma schema.
ALTER TABLE business.users
  ADD CONSTRAINT users_normalized_email CHECK (email = lower(btrim(email)) AND length(email) > 0),
  ADD CONSTRAINT users_role_code CHECK ((role = 'STAFF' AND account_code ~ '^STF-[0-9]{6,}$') OR (role = 'CUSTOMER' AND account_code ~ '^CUS-[0-9]{6,}$')),
  ADD CONSTRAINT users_failed_count CHECK (failed_login_attempts >= 0);
ALTER TABLE business.customer_profiles ADD CONSTRAINT customer_role CHECK (role = 'CUSTOMER');
ALTER TABLE business.staff_profiles ADD CONSTRAINT staff_role CHECK (role = 'STAFF');
ALTER TABLE business.staff_assignments
  ADD CONSTRAINT assignment_active_interval CHECK (is_active = (ended_at IS NULL)),
  ADD CONSTRAINT assignment_dates CHECK (ended_at IS NULL OR ended_at >= assigned_at);
CREATE UNIQUE INDEX one_active_staff_per_customer ON business.staff_assignments(customer_id) WHERE is_active;
ALTER TABLE business.auth_sessions
  ADD CONSTRAINT session_lifetime CHECK (expires_at > created_at),
  ADD CONSTRAINT session_token_hash CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT session_csrf_hash CHECK (csrf_token_hash ~ '^[0-9a-f]{64}$');
ALTER TABLE business.admin_requests ADD CONSTRAINT admin_fingerprint CHECK (fingerprint ~ '^[0-9a-f]{64}$');
ALTER TABLE business.rate_limit_buckets ADD CONSTRAINT rate_limit_count CHECK (request_count >= 0);
ALTER TABLE business.audit_logs
  ADD CONSTRAINT audit_outcome CHECK (outcome IN ('SUCCESS', 'FAILURE')),
  ADD CONSTRAINT audit_actor CHECK (
    (actor_type IN ('USER', 'AI_DELEGATED') AND actor_id IS NOT NULL AND operator_id IS NULL) OR
    (actor_type = 'OPERATOR' AND actor_id IS NULL AND operator_id IS NOT NULL) OR
    (actor_type = 'SYSTEM' AND actor_id IS NULL AND operator_id IS NULL));
ALTER TABLE business.insurance_contracts
  ADD CONSTRAINT contract_amounts CHECK ((premium_amount IS NULL OR premium_amount >= 0) AND (sum_assured IS NULL OR sum_assured >= 0));
ALTER TABLE business.documents ADD CONSTRAINT document_ownership CHECK (
  (access_scope = 'PUBLIC' AND policy_id IS NULL AND owner_customer_id IS NULL) OR
  (access_scope = 'PRIVATE_POLICY' AND policy_id IS NOT NULL AND owner_customer_id IS NOT NULL));
ALTER TABLE business.document_versions ADD CONSTRAINT version_checksum CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$');
ALTER TABLE business.messages ADD CONSTRAINT message_actor CHECK (
  (sender_type IN ('CUSTOMER', 'STAFF') AND sender_id IS NOT NULL) OR
  (sender_type IN ('AI_AGENT', 'SYSTEM') AND sender_id IS NULL));
ALTER TABLE business.outbox_events ADD CONSTRAINT outbox_retry_count CHECK (retry_count >= 0);
ALTER TABLE rag.rag_knowledge_chunks
  ADD CONSTRAINT chunk_index_valid CHECK (chunk_index >= 0),
  ADD CONSTRAINT chunk_page_valid CHECK (page_number IS NULL OR page_number > 0),
  ADD CONSTRAINT chunk_scope CHECK (access_scope IN ('PUBLIC', 'PRIVATE_POLICY'));

COMMIT;
