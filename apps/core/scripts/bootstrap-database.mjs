import { readFileSync } from 'node:fs';
import pg from 'pg';

const connection = { host: process.env.PGHOST ?? 'postgres', port: 5432, database: 'life_insurance', user: 'local_owner', password: readFileSync('/credentials/bootstrap/password', 'utf8').trim() };
const client = new pg.Client(connection);
const roles = { app_migrator: 'migration', core_runtime: 'core', admin_runtime: 'admin', db_viewer: 'viewer', rag_indexer: 'rag_indexer', rag_retriever: 'rag_retriever', agent_migrator: 'agent_migrator', agent_runtime: 'agent_runtime' };
const literal = value => `'${value.replace(/'/g, "''")}'`;
try {
  await client.connect();
  await client.query('BEGIN');
  for (const [role, directory] of Object.entries(roles)) {
    const password = readFileSync(`/credentials/${directory}/password`, 'utf8').trim();
    const exists = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role]);
    if (!exists.rowCount) await client.query(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD ${literal(password)}`);
    // Do not silently rotate an existing role's password at application startup.
    await client.query(`ALTER ROLE ${role} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION`);
    await client.query(`GRANT CONNECT ON DATABASE life_insurance TO ${role}`);
  }
  await client.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
  await client.query('GRANT CREATE ON DATABASE life_insurance TO app_migrator');
  await client.query('CREATE SCHEMA IF NOT EXISTS business AUTHORIZATION app_migrator');
  await client.query('CREATE SCHEMA IF NOT EXISTS rag AUTHORIZATION app_migrator');
  // Extension exists without a fixed embedding dimension or a vector index.
  await client.query('CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public');
  await client.query('GRANT USAGE ON SCHEMA business TO core_runtime, admin_runtime, db_viewer');
  await client.query('GRANT USAGE ON SCHEMA rag TO db_viewer, rag_indexer, rag_retriever');
  await client.query('ALTER DEFAULT PRIVILEGES FOR ROLE app_migrator IN SCHEMA business GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO core_runtime, admin_runtime');
  await client.query('ALTER DEFAULT PRIVILEGES FOR ROLE app_migrator IN SCHEMA business GRANT SELECT ON TABLES TO db_viewer');
  await client.query('ALTER DEFAULT PRIVILEGES FOR ROLE app_migrator IN SCHEMA rag GRANT SELECT ON TABLES TO db_viewer');
  // Offline Agent indexer replaces whole document versions (DELETE + INSERT); Agent retrieval runtime only reads rag.
  // Neither role has business access. Explicit grants cover rag tables migrated before these roles existed.
  await client.query('ALTER DEFAULT PRIVILEGES FOR ROLE app_migrator IN SCHEMA rag GRANT SELECT, INSERT, DELETE ON TABLES TO rag_indexer');
  await client.query('ALTER DEFAULT PRIVILEGES FOR ROLE app_migrator IN SCHEMA rag GRANT SELECT ON TABLES TO rag_retriever');
  await client.query('GRANT SELECT, INSERT, DELETE ON ALL TABLES IN SCHEMA rag TO rag_indexer');
  await client.query('GRANT SELECT ON ALL TABLES IN SCHEMA rag TO rag_retriever');
  // Agent durable runtime (checkpoint, receipts, ledger, outbound events): own schema/roles, no business or rag access.
  // agent_migrator owns the schema and runs apps/agent migrations; agent_runtime gets DML only, no DDL.
  await client.query(readFileSync(new URL('./agent-runtime-grants.sql', import.meta.url), 'utf8'));
  await client.query('ALTER DEFAULT PRIVILEGES FOR ROLE app_migrator IN SCHEMA business GRANT USAGE, SELECT ON SEQUENCES TO core_runtime, admin_runtime');
  await client.query('COMMIT');
  console.log('Database roles and namespaces ready; no runtime superuser or DDL grants.');
} catch {
  await client.query('ROLLBACK').catch(() => {});
  console.error('Database bootstrap failed. Check local credential volumes and database availability.');
  process.exitCode = 1;
} finally {
  await client.end();
}
