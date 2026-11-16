BEGIN;
-- Repair only untouched baselines from the first migration. Runtime watermarks
-- and cycles that have since advanced must never be rewound.
LOCK TABLE business.conversation_notification_states IN SHARE ROW EXCLUSIVE MODE;
WITH original AS (
  SELECT finished_at FROM business._prisma_migrations
  WHERE migration_name='202611160001_notification_cycles'
    AND finished_at IS NOT NULL AND rolled_back_at IS NULL
  ORDER BY finished_at DESC LIMIT 1
), baseline AS (
  SELECT s.id, s.last_processed_sequence, s.read_through_sequence,
    (SELECT min(m.sequence) FROM business.messages m
      WHERE m.conversation_id=s.conversation_id AND m.audience='CUSTOMER_VISIBLE'
        AND m.sequence<=s.last_processed_sequence AND m.read_at IS NULL
        AND m.sender_type::text=CASE WHEN s.kind='STAFF_MESSAGE_UNREAD' THEN 'STAFF' ELSE 'CUSTOMER' END) AS first_unread,
    EXISTS(SELECT 1 FROM business.outbox_events e
      WHERE e.aggregate_type='CONVERSATION' AND e.aggregate_id=s.conversation_id
        AND e.event_type='MESSAGE_COMMITTED' AND e.payload->>'schemaVersion'='1'
        AND e.status IN ('PENDING','PROCESSING','FAILED_DLQ')) AS pending_legacy
  FROM business.conversation_notification_states s, original o
  WHERE s.updated_at<=o.finished_at AND s.cycle_start_sequence IS NULL
), repaired AS (
UPDATE business.conversation_notification_states s SET
  last_processed_sequence=CASE WHEN b.pending_legacy AND b.first_unread IS NOT NULL
    THEN b.first_unread-1 ELSE s.last_processed_sequence END,
  read_through_sequence=CASE WHEN b.pending_legacy AND b.first_unread IS NOT NULL
    THEN LEAST(s.read_through_sequence,b.first_unread-1) ELSE s.read_through_sequence END,
  active_notification_id=CASE WHEN b.first_unread IS NULL THEN NULL ELSE s.active_notification_id END,
  cycle_start_sequence=CASE WHEN b.first_unread IS NULL THEN NULL ELSE b.first_unread END,
  updated_at=CURRENT_TIMESTAMP(3)
FROM baseline b WHERE s.id=b.id
RETURNING s.conversation_id, b.pending_legacy, b.first_unread
)
UPDATE business.outbox_events e SET status='PENDING',retry_count=0,
 next_attempt_at=CURRENT_TIMESTAMP,lease_owner=NULL,lease_expires_at=NULL,last_error=NULL
WHERE e.aggregate_type='CONVERSATION' AND e.event_type='MESSAGE_COMMITTED'
 AND e.payload->>'schemaVersion'='1' AND e.status='FAILED_DLQ'
 AND EXISTS(SELECT 1 FROM repaired r WHERE r.conversation_id=e.aggregate_id
   AND r.pending_legacy AND r.first_unread IS NOT NULL);
COMMIT;
