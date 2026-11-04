ALTER TABLE business.outbox_events
  ADD COLUMN lease_owner varchar(100),
  ADD COLUMN lease_expires_at timestamptz(3);
CREATE INDEX outbox_events_status_next_attempt_at_lease_expires_at_idx
  ON business.outbox_events(status,next_attempt_at,lease_expires_at);
ALTER TABLE business.notifications ADD COLUMN kind varchar(50);
ALTER TABLE business.notifications ADD CONSTRAINT notifications_kind_allowlist
  CHECK(kind IS NULL OR kind='HANDOFF_REQUESTED');
