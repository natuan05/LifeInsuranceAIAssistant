BEGIN;

-- 1. Allow recipient_staff_id to be NULL so recipient_customer_id can be used
ALTER TABLE "business"."notifications" ALTER COLUMN "recipient_staff_id" DROP NOT NULL;

-- 2. Add recipient_customer_id to notifications
ALTER TABLE "business"."notifications" ADD COLUMN "recipient_customer_id" UUID;

-- 3. Add foreign key to customer_profiles
ALTER TABLE "business"."notifications" ADD CONSTRAINT "notifications_recipient_customer_id_fkey"
  FOREIGN KEY ("recipient_customer_id") REFERENCES "business"."customer_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4. Check constraint: exactly one recipient (either Staff OR Customer)
ALTER TABLE "business"."notifications" ADD CONSTRAINT "notifications_recipient_check"
  CHECK ((recipient_staff_id IS NOT NULL AND recipient_customer_id IS NULL) OR
         (recipient_staff_id IS NULL AND recipient_customer_id IS NOT NULL));

-- 5. Index for customer notification query
CREATE INDEX "notifications_recipient_customer_id_is_read_created_at_idx"
  ON "business"."notifications"("recipient_customer_id", "is_read", "created_at");

-- 6. Update kind allowlist with new event kinds
ALTER TABLE "business"."notifications" DROP CONSTRAINT IF EXISTS notifications_kind_allowlist;
ALTER TABLE "business"."notifications" ADD CONSTRAINT notifications_kind_allowlist
  CHECK(kind IS NULL OR kind IN (
    'HANDOFF_REQUESTED',
    'TICKET_CREATED',
    'TICKET_ACCEPTED',
    'TICKET_STATUS_CHANGED',
    'STAFF_ACCEPTED_HANDOFF',
    'SUPPORT_TICKET_CREATED',
    'STAFF_MESSAGE_UNREAD'
  ));

-- 7. Update typed target constraint
ALTER TABLE "business"."notifications" DROP CONSTRAINT IF EXISTS notifications_typed_target;
ALTER TABLE "business"."notifications" ADD CONSTRAINT notifications_typed_target
  CHECK(kind IS NULL OR
    (kind IN ('HANDOFF_REQUESTED', 'STAFF_ACCEPTED_HANDOFF', 'STAFF_MESSAGE_UNREAD') AND conversation_id IS NOT NULL AND ticket_id IS NULL) OR
    (kind IN ('TICKET_CREATED', 'TICKET_ACCEPTED', 'TICKET_STATUS_CHANGED', 'SUPPORT_TICKET_CREATED') AND ticket_id IS NOT NULL AND conversation_id IS NULL));

-- 8. Add read_at timestamp to messages
ALTER TABLE "business"."messages" ADD COLUMN "read_at" TIMESTAMPTZ(3);
CREATE INDEX "messages_conversation_id_read_at_idx" ON "business"."messages"("conversation_id", "read_at");

COMMIT;

