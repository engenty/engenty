-- The transcript's "remembered up to here" line reads Mastra's observational
-- memory record for a thread. Mastra creates and owns its tables (as
-- postgres) and grants nothing, so the service lane could not read them.
-- Grant SELECT on that table now, and on every table Mastra creates in `ai`
-- from here on, so a fresh database gets the same read after Mastra's first
-- start. Read-only: the observer stays the only writer.

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA ai
  GRANT SELECT ON TABLES TO service_role;

DO $$
BEGIN
  IF to_regclass('ai.mastra_observational_memory') IS NOT NULL THEN
    GRANT SELECT ON TABLE ai.mastra_observational_memory TO service_role;
  END IF;
END $$;
