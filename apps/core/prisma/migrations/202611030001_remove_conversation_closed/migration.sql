BEGIN;

-- Serialize the legacy conversion and enum replacement with conversation writers.
LOCK TABLE business.conversations IN ACCESS EXCLUSIVE MODE;

-- Internal Copilot ownership cannot be inferred from a legacy terminal status.
-- Fail atomically rather than silently removing its controller or granting access.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM business.conversations
    WHERE status = 'CLOSED' AND channel_type <> 'CUSTOMER_SUPPORT'
  ) THEN
    RAISE EXCEPTION 'Legacy CLOSED Copilot conversations require an ownership review before migration';
  END IF;
END $$;

-- Preserve the old controller/status without copying message contents into audit.
INSERT INTO business.audit_logs (
  actor_type, action, target_type, target_id, outcome, request_id, metadata
)
SELECT 'SYSTEM', 'CONVERSATION_STATUS_MIGRATED', 'Conversation', id,
  'SUCCESS', gen_random_uuid(), jsonb_build_object(
    'migration', '202611030001_remove_conversation_closed',
    'previousStatus', 'CLOSED',
    'previousAssignedStaffId', assigned_staff_id,
    'newStatus', 'AI_ACTIVE'
  )
FROM business.conversations WHERE status = 'CLOSED';

-- AI mode is private to the Customer. Do not invent handoff consent, acceptance,
-- Ticket state or a Staff grant. Retain messages, links and activity timestamps.
UPDATE business.conversations
SET status = 'AI_ACTIVE', assigned_staff_id = NULL
WHERE status = 'CLOSED';

CREATE TYPE business."ConversationStatus_new" AS ENUM (
  'AI_ACTIVE', 'PENDING_HANDOFF', 'STAFF_ACTIVE'
);
ALTER TABLE business.conversations ALTER COLUMN status
  TYPE business."ConversationStatus_new"
  USING status::text::business."ConversationStatus_new";
DROP TYPE business."ConversationStatus";
ALTER TYPE business."ConversationStatus_new" RENAME TO "ConversationStatus";

COMMIT;
