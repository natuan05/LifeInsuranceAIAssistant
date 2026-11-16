BEGIN;

-- Update kind allowlist to include CUSTOMER_MESSAGE_UNREAD
ALTER TABLE "business"."notifications" DROP CONSTRAINT IF EXISTS notifications_kind_allowlist;
ALTER TABLE "business"."notifications" ADD CONSTRAINT notifications_kind_allowlist
  CHECK(kind IS NULL OR kind IN (
    'HANDOFF_REQUESTED',
    'TICKET_CREATED',
    'TICKET_ACCEPTED',
    'TICKET_STATUS_CHANGED',
    'STAFF_ACCEPTED_HANDOFF',
    'SUPPORT_TICKET_CREATED',
    'STAFF_MESSAGE_UNREAD',
    'CUSTOMER_MESSAGE_UNREAD'
  ));

-- Update typed target constraint
ALTER TABLE "business"."notifications" DROP CONSTRAINT IF EXISTS notifications_typed_target;
ALTER TABLE "business"."notifications" ADD CONSTRAINT notifications_typed_target
  CHECK(kind IS NULL OR
    (kind IN ('HANDOFF_REQUESTED', 'STAFF_ACCEPTED_HANDOFF', 'STAFF_MESSAGE_UNREAD', 'CUSTOMER_MESSAGE_UNREAD') AND conversation_id IS NOT NULL AND ticket_id IS NULL) OR
    (kind IN ('TICKET_CREATED', 'TICKET_ACCEPTED', 'TICKET_STATUS_CHANGED', 'SUPPORT_TICKET_CREATED') AND ticket_id IS NOT NULL AND conversation_id IS NULL));

COMMIT;

