BEGIN;
ALTER TABLE business.notifications DROP CONSTRAINT notifications_kind_allowlist;
ALTER TABLE business.notifications ADD CONSTRAINT notifications_kind_allowlist
  CHECK(kind IS NULL OR kind IN ('HANDOFF_REQUESTED','TICKET_CREATED','TICKET_ACCEPTED'));
-- Legacy kind=NULL rows retain their existing shape. New typed notifications
-- have exactly one matching target, independent of chat access.
ALTER TABLE business.notifications ADD CONSTRAINT notifications_typed_target
  CHECK(kind IS NULL OR
    (kind='HANDOFF_REQUESTED' AND conversation_id IS NOT NULL AND ticket_id IS NULL) OR
    (kind IN ('TICKET_CREATED','TICKET_ACCEPTED') AND ticket_id IS NOT NULL AND conversation_id IS NULL));
COMMIT;
