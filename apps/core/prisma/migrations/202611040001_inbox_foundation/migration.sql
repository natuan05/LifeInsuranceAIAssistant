BEGIN;
LOCK TABLE business.conversations, business.messages IN ACCESS EXCLUSIVE MODE;

CREATE TYPE business."SupportOrigin" AS ENUM ('AI','DIRECT','LEGACY_UNKNOWN');
CREATE TYPE business."MessageAudience" AS ENUM ('CUSTOMER_VISIBLE','INTERNAL','LEGACY_REVIEW');
CREATE TYPE business."HandoffState" AS ENUM ('PENDING','ACCEPTED','REVOKED');

ALTER TABLE business.staff_assignments
  ADD CONSTRAINT staff_assignments_id_customer_id_key UNIQUE(id,customer_id),
  ADD CONSTRAINT staff_assignments_id_customer_id_staff_id_key UNIQUE(id,customer_id,staff_id);
ALTER TABLE business.conversations
  ADD COLUMN support_origin business."SupportOrigin",
  ADD COLUMN created_by_customer_id uuid,
  ADD COLUMN subject varchar(180),
  ADD COLUMN direct_assignment_id uuid,
  ADD COLUMN control_version integer NOT NULL DEFAULT 0,
  ADD COLUMN next_message_sequence bigint NOT NULL DEFAULT 0,
  ADD COLUMN last_customer_facing_activity_at timestamptz(3),
  ADD CONSTRAINT conversations_id_customer_id_key UNIQUE(id,customer_id),
  ADD CONSTRAINT conversations_direct_assignment_id_customer_id_fkey
    FOREIGN KEY(direct_assignment_id,customer_id) REFERENCES business.staff_assignments(id,customer_id) ON DELETE RESTRICT ON UPDATE NO ACTION;

UPDATE business.conversations SET support_origin='LEGACY_UNKNOWN' WHERE channel_type='CUSTOMER_SUPPORT';

ALTER TABLE business.messages
  ADD COLUMN sequence bigint,
  ADD COLUMN audience business."MessageAudience",
  ADD COLUMN client_message_id uuid,
  ADD COLUMN internal_message_id uuid;
WITH numbered AS (
  SELECT id,row_number() OVER(PARTITION BY conversation_id ORDER BY created_at,id) AS seq
  FROM business.messages
)
UPDATE business.messages m SET sequence=n.seq,
  audience=CASE WHEN c.channel_type='STAFF_COPILOT' THEN 'INTERNAL'::business."MessageAudience"
    ELSE 'LEGACY_REVIEW'::business."MessageAudience" END
FROM numbered n, business.conversations c WHERE n.id=m.id AND c.id=m.conversation_id;
UPDATE business.conversations c SET next_message_sequence=(SELECT coalesce(max(sequence),0) FROM business.messages WHERE conversation_id=c.id);
ALTER TABLE business.messages
  ALTER COLUMN sequence SET NOT NULL, ALTER COLUMN audience SET NOT NULL,
  ADD CONSTRAINT messages_sequence_positive CHECK(sequence>0),
  ADD CONSTRAINT messages_client_actor CHECK(client_message_id IS NULL OR sender_type IN ('CUSTOMER','STAFF')),
  ADD CONSTRAINT messages_internal_actor CHECK(internal_message_id IS NULL OR sender_type IN ('AI_AGENT','SYSTEM')),
  ADD CONSTRAINT messages_one_command_key CHECK(client_message_id IS NULL OR internal_message_id IS NULL),
  ADD CONSTRAINT messages_conversation_id_sequence_key UNIQUE(conversation_id,sequence),
  ADD CONSTRAINT messages_conversation_id_sender_id_client_message_id_key UNIQUE(conversation_id,sender_id,client_message_id),
  ADD CONSTRAINT messages_conversation_id_internal_message_id_key UNIQUE(conversation_id,internal_message_id);

ALTER TABLE business.conversations
  ADD CONSTRAINT conversation_control_nonnegative CHECK(control_version>=0 AND next_message_sequence>=0),
  ADD CONSTRAINT conversation_support_provenance CHECK(
    (channel_type='STAFF_COPILOT' AND support_origin IS NULL AND created_by_customer_id IS NULL AND direct_assignment_id IS NULL) OR
    (channel_type='CUSTOMER_SUPPORT' AND support_origin IS NOT NULL AND
      ((support_origin='LEGACY_UNKNOWN' AND created_by_customer_id IS NULL AND direct_assignment_id IS NULL) OR
       (support_origin='AI' AND created_by_customer_id=customer_id AND created_by_customer_id IS NOT NULL AND direct_assignment_id IS NULL) OR
       (support_origin='DIRECT' AND created_by_customer_id=customer_id AND created_by_customer_id IS NOT NULL AND direct_assignment_id IS NOT NULL))));

CREATE TABLE business.conversation_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid NOT NULL, customer_id uuid NOT NULL,
  assignment_id uuid NOT NULL, recipient_staff_id uuid NOT NULL,
  state business."HandoffState" NOT NULL DEFAULT 'PENDING',
  shared_subject varchar(180) NOT NULL, shared_reason varchar(1000),
  consent_scope varchar(64) NOT NULL, consent_text_version varchar(50) NOT NULL,
  confirmed_by_customer_id uuid NOT NULL, confirmed_at timestamptz(3) NOT NULL DEFAULT now(),
  accepted_by_staff_id uuid, accepted_at timestamptz(3), revoked_at timestamptz(3), revoke_reason varchar(50),
  CONSTRAINT conversation_handoffs_conversation_id_customer_id_fkey FOREIGN KEY(conversation_id,customer_id)
    REFERENCES business.conversations(id,customer_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT conversation_handoffs_assignment_id_customer_id_recipient_sta_fkey FOREIGN KEY(assignment_id,customer_id,recipient_staff_id)
    REFERENCES business.staff_assignments(id,customer_id,staff_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT handoff_customer_consent CHECK(confirmed_by_customer_id=customer_id AND
    consent_scope='ENTIRE_CUSTOMER_VISIBLE_CONVERSATION' AND consent_text_version='handoff-v1' AND length(btrim(shared_subject))>0),
  CONSTRAINT handoff_acceptance CHECK(
    ((accepted_at IS NULL AND accepted_by_staff_id IS NULL) OR
      (accepted_at IS NOT NULL AND accepted_by_staff_id IS NOT NULL AND accepted_by_staff_id=recipient_staff_id AND accepted_at>=confirmed_at)) AND
    (state<>'ACCEPTED' OR accepted_at IS NOT NULL) AND (state<>'PENDING' OR accepted_at IS NULL)),
  CONSTRAINT handoff_revocation CHECK(
    (state='REVOKED' AND revoked_at IS NOT NULL AND revoke_reason IS NOT NULL AND length(btrim(revoke_reason))>0 AND revoked_at>=coalesce(accepted_at,confirmed_at)) OR
    (state<>'REVOKED' AND revoked_at IS NULL AND revoke_reason IS NULL))
);
CREATE UNIQUE INDEX one_current_handoff_per_conversation ON business.conversation_handoffs(conversation_id) WHERE state IN ('PENDING','ACCEPTED');
CREATE INDEX conversation_handoffs_recipient_staff_id_assignment_id_state_idx ON business.conversation_handoffs(recipient_staff_id,assignment_id,state,confirmed_at,id);
CREATE INDEX conversation_handoffs_conversation_id_state_idx ON business.conversation_handoffs(conversation_id,state);

CREATE TABLE business.conversation_command_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid NOT NULL REFERENCES business.users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  operation varchar(50) NOT NULL, client_request_id uuid NOT NULL, request_hash char(64) NOT NULL,
  resource_id uuid NOT NULL, result_version integer NOT NULL, created_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT conversation_command_receipts_actor_id_operation_client_reque_key UNIQUE(actor_id,operation,client_request_id),
  CONSTRAINT command_hash CHECK(request_hash ~ '^[0-9a-f]{64}$' AND result_version>=0),
  CONSTRAINT command_operation CHECK(operation IN ('CREATE_AI','CREATE_DIRECT','REQUEST_HANDOFF','ACCEPT_HANDOFF','SEND_MESSAGE'))
);
CREATE INDEX conversations_customer_id_status_last_customer_facing_activit_idx ON business.conversations(customer_id,status,last_customer_facing_activity_at,id);
CREATE INDEX messages_conversation_id_audience_sequence_idx ON business.messages(conversation_id,audience,sequence);

-- Provenance is write-once. No flag change may turn a private AI chat into Direct.
CREATE FUNCTION business.guard_conversation_provenance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND (NEW.support_origin,NEW.created_by_customer_id,NEW.direct_assignment_id,NEW.customer_id,NEW.channel_type)
    IS DISTINCT FROM (OLD.support_origin,OLD.created_by_customer_id,OLD.direct_assignment_id,OLD.customer_id,OLD.channel_type) THEN
    RAISE EXCEPTION 'Conversation provenance is immutable' USING ERRCODE='23514';
  END IF;
  IF TG_OP='INSERT' AND NEW.support_origin='DIRECT' AND NOT EXISTS (
    SELECT 1 FROM business.staff_assignments WHERE id=NEW.direct_assignment_id AND customer_id=NEW.customer_id
    AND staff_id=NEW.assigned_staff_id AND is_active
  ) THEN RAISE EXCEPTION 'Direct requires current assignment' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER conversation_provenance_guard BEFORE INSERT OR UPDATE ON business.conversations
  FOR EACH ROW EXECUTE FUNCTION business.guard_conversation_provenance();

CREATE FUNCTION business.guard_handoff_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND (NEW.conversation_id,NEW.customer_id,NEW.assignment_id,NEW.recipient_staff_id,
    NEW.shared_subject,NEW.shared_reason,NEW.consent_scope,NEW.consent_text_version,NEW.confirmed_by_customer_id,NEW.confirmed_at)
    IS DISTINCT FROM (OLD.conversation_id,OLD.customer_id,OLD.assignment_id,OLD.recipient_staff_id,
    OLD.shared_subject,OLD.shared_reason,OLD.consent_scope,OLD.consent_text_version,OLD.confirmed_by_customer_id,OLD.confirmed_at) THEN
    RAISE EXCEPTION 'Handoff consent is immutable' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND (OLD.state='REVOKED' OR (OLD.state='ACCEPTED' AND
    (NEW.accepted_by_staff_id,NEW.accepted_at) IS DISTINCT FROM (OLD.accepted_by_staff_id,OLD.accepted_at))) THEN
    RAISE EXCEPTION 'Handoff evidence cannot be rewritten' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM business.conversations WHERE id=NEW.conversation_id
    AND channel_type='CUSTOMER_SUPPORT' AND support_origin IN ('AI','DIRECT')) THEN
    RAISE EXCEPTION 'Handoff requires classified support conversation' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER handoff_evidence_guard BEFORE INSERT OR UPDATE ON business.conversation_handoffs
  FOR EACH ROW EXECUTE FUNCTION business.guard_handoff_evidence();

CREATE FUNCTION business.guard_message_audience() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.audience<>'INTERNAL' AND EXISTS(SELECT 1 FROM business.conversations WHERE id=NEW.conversation_id AND channel_type='STAFF_COPILOT') THEN
    RAISE EXCEPTION 'Copilot messages must remain internal' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER message_audience_guard BEFORE INSERT OR UPDATE ON business.messages
  FOR EACH ROW EXECUTE FUNCTION business.guard_message_audience();
COMMIT;
