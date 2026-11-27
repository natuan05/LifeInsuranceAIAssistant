CREATE INDEX agent_runs_active_deadline
  ON business.agent_runs ((COALESCE(limits->>'deadline_at', '')), id)
  WHERE status IN ('QUEUED', 'RUNNING');
