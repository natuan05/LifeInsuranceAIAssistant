BEGIN;

-- Existing tickets retain their content, recipient, confirmation time and status.
-- Confirmation snapshots are a separate workflow; a version is not consent.
ALTER TABLE business.support_tickets
  ADD COLUMN version integer NOT NULL DEFAULT 0;
ALTER TABLE business.support_tickets
  ADD CONSTRAINT support_tickets_version_nonnegative CHECK (version >= 0);

COMMIT;
