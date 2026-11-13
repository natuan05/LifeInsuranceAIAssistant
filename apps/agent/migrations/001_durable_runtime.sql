-- Agent durable runtime (plan Task 4; contracts/agent-v1.md section 12, decisions of 06/11/2026).
-- Applied by `python -m life_agent.store migrate` as agent_migrator into the existing schema agent_runtime.
-- No FK, view, trigger or join towards business/rag: IDs are links only, Core checks permissions.

CREATE TABLE agent_runtime.run_receipts (
  attempt_id       uuid PRIMARY KEY,
  run_id           uuid,                               -- NULL only for revoke tombstones
  conversation_id  uuid,
  message_id       uuid,
  thread_id        text NOT NULL,
  request_sha256   char(64),
  request          jsonb,                              -- RunRequest as received (contains the message text)
  status           text NOT NULL CHECK (status IN ('ACCEPTED', 'FINALIZED', 'REVOKED')),
  final_event_id   uuid,
  claimed_by       text,
  lease_expires_at timestamptz,
  accepted_at      timestamptz NOT NULL DEFAULT now(),
  revoked_at       timestamptz,
  CONSTRAINT receipt_final CHECK (status <> 'FINALIZED' OR final_event_id IS NOT NULL),
  CONSTRAINT receipt_tombstone CHECK (request_sha256 IS NOT NULL OR (status = 'REVOKED' AND run_id IS NULL))
);
CREATE INDEX run_receipts_recover ON agent_runtime.run_receipts (lease_expires_at) WHERE status = 'ACCEPTED';
CREATE INDEX run_receipts_message ON agent_runtime.run_receipts (message_id);

-- One writer per thread. Every write checks (thread_id, attempt_id, writer_epoch) FOR SHARE in its own transaction;
-- revoke, transfer to a new attempt and every claim raise the epoch under the row lock.
CREATE TABLE agent_runtime.thread_owners (
  thread_id    text PRIMARY KEY,
  attempt_id   uuid NOT NULL,
  writer_epoch bigint NOT NULL CHECK (writer_epoch > 0),
  revoked      boolean NOT NULL DEFAULT false,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE agent_runtime.checkpoints (
  thread_id            text NOT NULL,
  checkpoint_ns        text NOT NULL DEFAULT '',
  checkpoint_id        text NOT NULL,
  parent_checkpoint_id text,
  checkpoint_type      text NOT NULL,
  checkpoint           bytea NOT NULL,                  -- serialized by the LangGraph serializer, without channel values
  metadata_type        text NOT NULL,
  metadata             bytea NOT NULL,
  writer_attempt_id    uuid NOT NULL,
  writer_epoch         bigint NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
);
CREATE TABLE agent_runtime.checkpoint_blobs (
  thread_id     text NOT NULL,
  checkpoint_ns text NOT NULL DEFAULT '',
  channel       text NOT NULL,
  version       text NOT NULL,
  value_type    text NOT NULL,
  value         bytea,
  PRIMARY KEY (thread_id, checkpoint_ns, channel, version)
);
CREATE TABLE agent_runtime.checkpoint_writes (
  thread_id         text NOT NULL,
  checkpoint_ns     text NOT NULL DEFAULT '',
  checkpoint_id     text NOT NULL,
  task_id           text NOT NULL,
  idx               integer NOT NULL,
  task_path         text NOT NULL DEFAULT '',
  channel           text NOT NULL,
  value_type        text NOT NULL,
  value             bytea,
  writer_attempt_id uuid NOT NULL,
  writer_epoch      bigint NOT NULL,
  PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
);

CREATE TABLE agent_runtime.ledgers (
  message_id uuid NOT NULL,
  kind       text NOT NULL CHECK (kind IN ('retrieval_calls', 'core_read_requests', 'model_calls', 'model_tokens', 'graph_steps')),
  cap        bigint NOT NULL CHECK (cap >= 0),
  used       bigint NOT NULL DEFAULT 0 CHECK (used >= 0),
  PRIMARY KEY (message_id, kind)
);
CREATE TABLE agent_runtime.reservations (
  message_id   uuid NOT NULL,
  kind         text NOT NULL,
  operation_id text NOT NULL,
  attempt_id   uuid NOT NULL,
  amount       bigint NOT NULL CHECK (amount >= 0),
  settled      boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, kind, operation_id),
  FOREIGN KEY (message_id, kind) REFERENCES agent_runtime.ledgers (message_id, kind)
);

CREATE TABLE agent_runtime.attempt_sequences (
  attempt_id    uuid PRIMARY KEY REFERENCES agent_runtime.run_receipts (attempt_id),
  last_sequence integer NOT NULL CHECK (last_sequence >= 0)
);
CREATE TABLE agent_runtime.outbound_events (
  event_id          uuid PRIMARY KEY,
  attempt_id        uuid NOT NULL REFERENCES agent_runtime.run_receipts (attempt_id),
  run_id            uuid NOT NULL,
  sequence          integer NOT NULL CHECK (sequence > 0),
  kind              text NOT NULL CHECK (kind IN ('PROGRESS', 'RESULT', 'ERROR')),
  event             jsonb NOT NULL,                    -- immutable AgentEvent exactly as first stored
  event_sha256      char(64) NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  delivery_attempts integer NOT NULL DEFAULT 0,
  next_delivery_at  timestamptz NOT NULL DEFAULT now(),
  ack_outcome       text CHECK (ack_outcome IN ('ACCEPTED', 'DUPLICATE', 'IGNORED_STALE', 'CONFLICT')),
  acked_at          timestamptz,
  UNIQUE (attempt_id, sequence)
);
CREATE INDEX outbound_events_pending ON agent_runtime.outbound_events (next_delivery_at) WHERE ack_outcome IS NULL;

-- HMAC replay window (Task 6).
CREATE TABLE agent_runtime.request_nonces (
  key_id      text NOT NULL,
  nonce       text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (key_id, nonce)
);
