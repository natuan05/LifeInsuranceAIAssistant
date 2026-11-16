BEGIN;
CREATE TABLE business.conversation_notification_states (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 recipient_user_id uuid NOT NULL REFERENCES business.users(id) ON DELETE CASCADE,
 conversation_id uuid NOT NULL REFERENCES business.conversations(id) ON DELETE CASCADE,
 kind varchar(50) NOT NULL CHECK (kind IN ('STAFF_MESSAGE_UNREAD','CUSTOMER_MESSAGE_UNREAD')),
 read_through_sequence bigint NOT NULL DEFAULT 0 CHECK (read_through_sequence>=0),
 last_processed_sequence bigint NOT NULL DEFAULT 0 CHECK (last_processed_sequence>=0),
 cycle_start_sequence bigint CHECK (cycle_start_sequence>0),
 active_notification_id uuid REFERENCES business.notifications(id) ON DELETE SET NULL,
 updated_at timestamptz(3) NOT NULL DEFAULT now(),
 UNIQUE(recipient_user_id,conversation_id,kind)
);
-- Existing history is a reconciliation baseline, never a new-message event.
INSERT INTO business.conversation_notification_states
(recipient_user_id,conversation_id,kind,read_through_sequence,last_processed_sequence,active_notification_id,cycle_start_sequence)
SELECT COALESCE(n.recipient_customer_id,n.recipient_staff_id), n.conversation_id,n.kind,
 COALESCE((SELECT max(sequence) FROM business.messages m WHERE m.conversation_id=n.conversation_id AND m.audience='CUSTOMER_VISIBLE' AND m.read_at IS NOT NULL),0),
 COALESCE((SELECT max(sequence) FROM business.messages m WHERE m.conversation_id=n.conversation_id AND m.audience='CUSTOMER_VISIBLE'),0),
 n.id, NULL
FROM (SELECT DISTINCT ON (COALESCE(recipient_customer_id,recipient_staff_id),conversation_id,kind) *
 FROM business.notifications WHERE kind IN ('STAFF_MESSAGE_UNREAD','CUSTOMER_MESSAGE_UNREAD')
 ORDER BY COALESCE(recipient_customer_id,recipient_staff_id),conversation_id,kind,created_at DESC,id DESC) n;
-- Seed recipient baselines even where old notifications have already expired.
INSERT INTO business.conversation_notification_states
(recipient_user_id,conversation_id,kind,read_through_sequence,last_processed_sequence)
SELECT c.customer_id,c.id,'STAFF_MESSAGE_UNREAD',0,COALESCE(max(m.sequence),0)
FROM business.conversations c LEFT JOIN business.messages m ON m.conversation_id=c.id AND m.audience='CUSTOMER_VISIBLE'
GROUP BY c.customer_id,c.id ON CONFLICT DO NOTHING;
INSERT INTO business.conversation_notification_states
(recipient_user_id,conversation_id,kind,read_through_sequence,last_processed_sequence)
SELECT c.assigned_staff_id,c.id,'CUSTOMER_MESSAGE_UNREAD',0,COALESCE(max(m.sequence),0)
FROM business.conversations c LEFT JOIN business.messages m ON m.conversation_id=c.id AND m.audience='CUSTOMER_VISIBLE'
WHERE c.assigned_staff_id IS NOT NULL GROUP BY c.assigned_staff_id,c.id ON CONFLICT DO NOTHING;
GRANT SELECT,INSERT,UPDATE,DELETE ON business.conversation_notification_states TO core_runtime,admin_runtime;
GRANT SELECT ON business.conversation_notification_states TO db_viewer;
COMMIT;
