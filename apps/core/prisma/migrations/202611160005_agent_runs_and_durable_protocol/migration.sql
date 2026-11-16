BEGIN;

CREATE TYPE business."AgentRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TYPE business."AgentAttemptState" AS ENUM ('DISPATCHING', 'ACCEPTED', 'INVALIDATING', 'INVALIDATED', 'FINISHED');

CREATE TABLE business.agent_runs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id     uuid NOT NULL REFERENCES business.conversations(id) ON DELETE RESTRICT,
  message_id          uuid NOT NULL UNIQUE REFERENCES business.messages(id) ON DELETE RESTRICT,
  queue_position      bigint NOT NULL,
  status              business."AgentRunStatus" NOT NULL DEFAULT 'QUEUED',
  current_attempt_id  uuid,
  history_view        jsonb,
  linked_history_view jsonb,
  limits              jsonb NOT NULL,
  progress_stage      varchar(20),
  progress_sequence   integer NOT NULL DEFAULT 0,
  result              jsonb,
  failure             jsonb,
  result_message_id   uuid REFERENCES business.messages(id) ON DELETE RESTRICT,
  created_at          timestamptz(3) NOT NULL DEFAULT now(),
  started_at          timestamptz(3),
  finished_at         timestamptz(3),
  UNIQUE (conversation_id, queue_position),
  CONSTRAINT agent_run_result CHECK ((status = 'COMPLETED') = (result IS NOT NULL)),
  CONSTRAINT agent_run_failure CHECK (status NOT IN ('FAILED', 'CANCELLED') OR failure IS NOT NULL)
);
CREATE UNIQUE INDEX agent_runs_one_running ON business.agent_runs (conversation_id) WHERE status = 'RUNNING';
CREATE INDEX agent_runs_queued ON business.agent_runs (conversation_id, queue_position) WHERE status = 'QUEUED';

CREATE TABLE business.agent_attempts (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                  uuid NOT NULL REFERENCES business.agent_runs(id) ON DELETE RESTRICT,
  attempt_no              integer NOT NULL CHECK (attempt_no > 0),
  state                   business."AgentAttemptState" NOT NULL DEFAULT 'DISPATCHING',
  request                 jsonb NOT NULL,
  request_sha256          char(64) NOT NULL,
  dispatch_count          integer NOT NULL DEFAULT 0,
  next_dispatch_at        timestamptz(3) NOT NULL DEFAULT now(),
  accepted_at             timestamptz(3),
  revocation_reason       varchar(30),
  revocation_requested_at timestamptz(3),
  revoked_at              timestamptz(3),
  revoked_epoch           bigint,
  created_at              timestamptz(3) NOT NULL DEFAULT now(),
  UNIQUE (run_id, attempt_no),
  CONSTRAINT agent_attempt_revocation CHECK (state NOT IN ('INVALIDATING', 'INVALIDATED') OR revocation_reason IS NOT NULL)
);
CREATE UNIQUE INDEX agent_attempts_one_live ON business.agent_attempts (run_id)
  WHERE state IN ('DISPATCHING', 'ACCEPTED', 'INVALIDATING');
CREATE INDEX agent_attempts_reconcile ON business.agent_attempts (next_dispatch_at)
  WHERE state IN ('DISPATCHING', 'INVALIDATING');
ALTER TABLE business.agent_runs ADD CONSTRAINT agent_runs_current_attempt_fk
  FOREIGN KEY (current_attempt_id) REFERENCES business.agent_attempts(id) ON DELETE RESTRICT;

CREATE TABLE business.agent_run_events (
  event_id       uuid PRIMARY KEY,
  attempt_id     uuid NOT NULL REFERENCES business.agent_attempts(id) ON DELETE RESTRICT,
  run_id         uuid NOT NULL REFERENCES business.agent_runs(id) ON DELETE RESTRICT,
  sequence       integer NOT NULL CHECK (sequence > 0),
  kind           varchar(10) NOT NULL CHECK (kind IN ('PROGRESS', 'RESULT', 'ERROR')),
  payload_sha256 char(64) NOT NULL,
  decision       varchar(20) NOT NULL CHECK (decision IN ('ACCEPTED', 'IGNORED_STALE')),
  received_at    timestamptz(3) NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, sequence)
);

CREATE TABLE business.agent_request_nonces (
  key_id      varchar(64) NOT NULL,
  nonce       varchar(32) NOT NULL,
  received_at timestamptz(3) NOT NULL DEFAULT now(),
  PRIMARY KEY (key_id, nonce)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON business.agent_runs, business.agent_attempts, business.agent_run_events, business.agent_request_nonces TO core_runtime, admin_runtime;
GRANT SELECT ON business.agent_runs, business.agent_attempts, business.agent_run_events, business.agent_request_nonces TO db_viewer;

COMMIT;
