-- Agent durable runtime: dedicated migration/runtime roles, no business or rag access.
CREATE SCHEMA IF NOT EXISTS agent_runtime AUTHORIZATION agent_migrator;
GRANT USAGE ON SCHEMA agent_runtime TO agent_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE agent_migrator IN SCHEMA agent_runtime
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO agent_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA agent_runtime TO agent_runtime;
-- Repeated bootstrap must preserve migrate()'s metadata boundary; the first bootstrap runs before this table exists.
DO $$ BEGIN
  IF to_regclass('agent_runtime.schema_migrations') IS NOT NULL THEN
    REVOKE ALL ON agent_runtime.schema_migrations FROM agent_runtime;
  END IF;
END $$;
REVOKE ALL ON SCHEMA agent_runtime FROM PUBLIC;
