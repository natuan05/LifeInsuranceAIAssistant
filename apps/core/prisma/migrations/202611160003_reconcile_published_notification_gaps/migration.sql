BEGIN;
LOCK TABLE business.conversation_notification_states IN SHARE ROW EXCLUSIVE MODE;
-- Published v1 events do not prove delivery. Recover only a still-unread,
-- unadvanced upgrade baseline with no notification, inside retention. Old
-- expired notifications and progressed runtime cycles must not be resurrected.
WITH history AS (
 SELECT
  max(finished_at) FILTER(WHERE migration_name='202611160001_notification_cycles') AS original_at,
  max(finished_at) FILTER(WHERE migration_name='202611160002_repair_notification_baselines') AS repair_at
 FROM business._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
), gaps AS (
 SELECT s.id,s.conversation_id,m.id AS message_id,m.sequence,c.control_version
 FROM business.conversation_notification_states s
 JOIN business.conversations c ON c.id=s.conversation_id
 CROSS JOIN history h
 JOIN LATERAL (
  SELECT m.id,m.sequence FROM business.messages m
  WHERE m.conversation_id=s.conversation_id AND m.audience='CUSTOMER_VISIBLE'
   AND m.sender_type::text=CASE WHEN s.kind='STAFF_MESSAGE_UNREAD' THEN 'STAFF' ELSE 'CUSTOMER' END
   AND m.read_at IS NULL AND m.created_at>=CURRENT_TIMESTAMP(3)-INTERVAL '30 days'
   AND m.created_at<=h.original_at
  ORDER BY m.sequence DESC LIMIT 1
 ) m ON true
 WHERE s.updated_at<=h.repair_at AND s.active_notification_id IS NULL
  AND s.last_processed_sequence=(SELECT max(sequence) FROM business.messages b
    WHERE b.conversation_id=s.conversation_id AND b.audience='CUSTOMER_VISIBLE' AND b.created_at<=h.original_at)
  AND NOT EXISTS(SELECT 1 FROM business.notifications n WHERE n.conversation_id=s.conversation_id AND n.kind=s.kind
    AND COALESCE(n.recipient_customer_id,n.recipient_staff_id)=s.recipient_user_id)
  AND EXISTS(SELECT 1 FROM business.outbox_events e WHERE e.aggregate_type='CONVERSATION'
    AND e.aggregate_id=s.conversation_id AND e.event_type='MESSAGE_COMMITTED'
    AND e.payload->>'schemaVersion'='1' AND e.status='PUBLISHED' AND e.created_at<=h.original_at)
), prepared AS (
 UPDATE business.conversation_notification_states s
 SET last_processed_sequence=g.sequence-1,read_through_sequence=LEAST(s.read_through_sequence,g.sequence-1),
  cycle_start_sequence=NULL,updated_at=CURRENT_TIMESTAMP(3)
 FROM gaps g WHERE s.id=g.id
 RETURNING s.id,s.conversation_id,g.message_id,g.sequence,g.control_version
)
INSERT INTO business.outbox_events(id,aggregate_type,aggregate_id,event_type,payload,status)
SELECT md5('notification-upgrade-reconcile:'||id::text)::uuid,'CONVERSATION',conversation_id,'MESSAGE_COMMITTED',
 jsonb_build_object('schemaVersion',2,'reason','MESSAGE_APPENDED','messageId',message_id,'sequence',sequence::text,'controlVersion',control_version),'PENDING'
FROM prepared ON CONFLICT(id) DO NOTHING;
COMMIT;
