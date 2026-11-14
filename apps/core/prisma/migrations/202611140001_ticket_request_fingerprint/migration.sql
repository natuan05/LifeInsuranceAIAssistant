ALTER TABLE business.support_tickets ADD COLUMN request_fingerprint varchar(64);
ALTER TABLE business.support_tickets ADD CONSTRAINT ticket_request_fingerprint
  CHECK (request_fingerprint IS NULL OR request_fingerprint ~ '^[0-9a-f]{64}$');
