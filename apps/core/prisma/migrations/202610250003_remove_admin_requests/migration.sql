BEGIN;
-- Refuse to discard any existing request history. No CASCADE or database reset.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM business.admin_requests LIMIT 1) THEN
    RAISE EXCEPTION 'admin_requests is not empty; preserve request history before removing this table';
  END IF;
END $$;
DROP TABLE business.admin_requests;
COMMIT;
