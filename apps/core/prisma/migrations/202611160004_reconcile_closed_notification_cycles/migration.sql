BEGIN;
LOCK TABLE business.conversation_notification_states IN SHARE ROW EXCLUSIVE MODE;
-- A read notice from a proven older chat cycle does not establish delivery of
-- later unread messages. Keep that notice read and reconcile the new cycle.
WITH history AS (
 SELECT
  max(finished_at) FILTER(WHERE migration_name='202611160001_notification_cycles') AS original_at,
  max(finished_at) FILTER(WHERE migration_name='202611160002_repair_notification_baselines') AS repair_at
 FROM business._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
), gaps AS (
 SELECT s.id,s.conversation_id,first_unread.sequence AS first_sequence,
  latest.id AS message_id,latest.sequence,c.control_version
 FROM business.conversation_notification_states s
 JOIN business.conversations c ON c.id=s.conversation_id
 JOIN business.notifications n ON n.id=s.active_notification_id
 CROSS JOIN history h
 JOIN LATERAL (
  SELECT m.sequence,m.created_at FROM business.messages m
  WHERE m.conversation_id=s.conversation_id AND m.audience='CUSTOMER_VISIBLE' AND m.read_at IS NULL
   AND m.sender_type::text=CASE WHEN s.kind='STAFF_MESSAGE_UNREAD' THEN 'STAFF' ELSE 'CUSTOMER' END
  ORDER BY m.sequence LIMIT 1
 ) first_unread ON true
 JOIN LATERAL (
  SELECT m.id,m.sequence FROM business.messages m
  WHERE m.conversation_id=s.conversation_id AND m.audience='CUSTOMER_VISIBLE' AND m.read_at IS NULL
   AND m.sender_type::text=CASE WHEN s.kind='STAFF_MESSAGE_UNREAD' THEN 'STAFF' ELSE 'CUSTOMER' END
   AND m.created_at<=h.original_at
  ORDER BY m.sequence DESC LIMIT 1
 ) latest ON true
 WHERE s.updated_at<=h.repair_at
  AND n.conversation_id=s.conversation_id AND n.kind=s.kind AND n.is_read
  AND COALESCE(n.recipient_customer_id,n.recipient_staff_id)=s.recipient_user_id
  AND n.created_at<first_unread.created_at
  AND first_unread.created_at>=CURRENT_TIMESTAMP(3)-INTERVAL '30 days'
  AND first_unread.created_at<=h.original_at
  AND s.last_processed_sequence IN (first_unread.sequence-1,
    (SELECT max(sequence) FROM business.messages b WHERE b.conversation_id=s.conversation_id
      AND b.audience='CUSTOMER_VISIBLE' AND b.created_at<=h.original_at))
  AND EXISTS(SELECT 1 FROM business.messages old WHERE old.conversation_id=s.conversation_id
    AND old.audience='CUSTOMER_VISIBLE' AND old.sequence<first_unread.sequence
    AND old.sender_type::text=CASE WHEN s.kind='STAFF_MESSAGE_UNREAD' THEN 'STAFF' ELSE 'CUSTOMER' END
    AND old.read_at>=n.created_at AND old.read_at<first_unread.created_at)
  AND NOT EXISTS(SELECT 1 FROM business.notifications delivered WHERE delivered.conversation_id=s.conversation_id
    AND delivered.kind=s.kind AND COALESCE(delivered.recipient_customer_id,delivered.recipient_staff_id)=s.recipient_user_id
    AND delivered.created_at>=first_unread.created_at)
  AND EXISTS(SELECT 1 FROM business.outbox_events e WHERE e.aggregate_type='CONVERSATION'
    AND e.aggregate_id=s.conversation_id AND e.event_type='MESSAGE_COMMITTED'
    AND e.payload->>'schemaVersion'='1' AND e.created_at<=h.original_at)
), prepared AS (
 UPDATE business.conversation_notification_states s
 SET last_processed_sequence=g.first_sequence-1,
  read_through_sequence=LEAST(s.read_through_sequence,g.first_sequence-1),
  active_notification_id=NULL,cycle_start_sequence=NULL,updated_at=CURRENT_TIMESTAMP(3)
 FROM gaps g WHERE s.id=g.id
 RETURNING s.id,s.conversation_id,g.message_id,g.sequence,g.control_version
)
INSERT INTO business.outbox_events(id,aggregate_type,aggregate_id,event_type,payload,status)
SELECT md5('notification-closed-upgrade-reconcile:'||id::text)::uuid,'CONVERSATION',conversation_id,'MESSAGE_COMMITTED',
 jsonb_build_object('schemaVersion',2,'reason','MESSAGE_APPENDED','messageId',message_id,'sequence',sequence::text,'controlVersion',control_version),'PENDING'
FROM prepared ON CONFLICT(id) DO NOTHING;
COMMIT;
