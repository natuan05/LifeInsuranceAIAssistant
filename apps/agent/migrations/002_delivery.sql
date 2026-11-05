-- Task 6: delivery bookkeeping for the callback loop (contracts/agent-v1.md 12.10; schedule values are proposals).
-- gave_up_at: resending stopped after the configured max age, recorded as an incident; a resend of the RunRequest by
-- Core (DUPLICATE) clears it. last_failure: filtered code of the last failed send (no body, header or URL).
ALTER TABLE agent_runtime.outbound_events
  ADD COLUMN gave_up_at   timestamptz,
  ADD COLUMN last_failure text CHECK (last_failure IS NULL OR last_failure ~ '^[A-Z_]{1,40}$');
DROP INDEX agent_runtime.outbound_events_pending;
CREATE INDEX outbound_events_pending ON agent_runtime.outbound_events (next_delivery_at)
  WHERE ack_outcome IS NULL AND gave_up_at IS NULL;
CREATE INDEX request_nonces_received ON agent_runtime.request_nonces (received_at);
