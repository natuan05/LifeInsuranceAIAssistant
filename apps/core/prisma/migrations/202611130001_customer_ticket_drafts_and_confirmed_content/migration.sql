BEGIN;

-- 1. Create TicketDraftState enum in business schema
CREATE TYPE business."TicketDraftState" AS ENUM ('DRAFT', 'CONFIRMED', 'EXPIRED', 'SUPERSEDED');

-- 2. Create ticket_drafts table
CREATE TABLE business.ticket_drafts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid,
    customer_id uuid NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    title character varying(255) NOT NULL,
    description text NOT NULL,
    policy_id uuid,
    state business."TicketDraftState" DEFAULT 'DRAFT'::business."TicketDraftState" NOT NULL,
    payload_hash character varying(64),
    expires_at timestamp(3) with time zone NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT ticket_drafts_pkey PRIMARY KEY (id),
    CONSTRAINT ticket_drafts_version_positive CHECK (version >= 1),
    CONSTRAINT ticket_drafts_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES business.customer_profiles(user_id) ON DELETE RESTRICT,
    CONSTRAINT ticket_drafts_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES business.conversations(id) ON DELETE RESTRICT,
    CONSTRAINT ticket_drafts_policy_id_fkey FOREIGN KEY (policy_id, customer_id) REFERENCES business.insurance_policies(id, customer_id) ON DELETE RESTRICT
);

CREATE INDEX ticket_drafts_customer_id_state_idx ON business.ticket_drafts(customer_id, state);
CREATE INDEX ticket_drafts_conversation_id_state_idx ON business.ticket_drafts(conversation_id, state);

-- 3. Add source_draft_id and confirmed_content to support_tickets
ALTER TABLE business.support_tickets
    ADD COLUMN source_draft_id uuid,
    ADD COLUMN confirmed_content jsonb;

ALTER TABLE business.support_tickets
    ADD CONSTRAINT support_tickets_source_draft_id_key UNIQUE (source_draft_id);

ALTER TABLE business.support_tickets
    ADD CONSTRAINT support_tickets_source_draft_id_fkey FOREIGN KEY (source_draft_id) REFERENCES business.ticket_drafts(id) ON DELETE RESTRICT;

COMMIT;
