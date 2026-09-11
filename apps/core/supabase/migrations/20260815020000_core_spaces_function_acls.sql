-- Stated rule (docs/agent/rules/module-migrations.mdc): functions revoke
-- PUBLIC execute and grant only the intended roles. The spaces work left five
-- functions on PostgreSQL's default PUBLIC execute, and the re-created
-- search.query_chunks lost the explicit ACL its original migration carried —
-- a new signature inherits nothing, it worked only because PUBLIC execute is
-- the default.
--
-- The four trigger functions are not a live hole — firing a trigger never
-- checks EXECUTE — and personal_space_key is INVOKER-rights and pure, so RLS
-- contains it either way. This aligns them with the rule so the next
-- `revoke ... from public` sweep in these schemas cannot break anything.

revoke all on function core.ensure_default_space() from public;
revoke all on function core.seed_space_baseline_mounts() from public;
revoke all on function core.ensure_personal_space() from public;
revoke all on function core.orphan_personal_space_on_leave() from public;
revoke all on function core.personal_space_key(uuid, uuid) from public;

-- Both lanes genuinely call query_chunks: packages/retrieval prefers the
-- tenant-locked handle (engenty_server) and falls back to the service client.
revoke all on function search.query_chunks(
  uuid, uuid, text, text, text, text, text[], text[], jsonb,
  timestamptz, timestamptz, integer, integer,
  double precision, double precision, boolean, uuid[]
) from public;

grant execute on function search.query_chunks(
  uuid, uuid, text, text, text, text, text[], text[], jsonb,
  timestamptz, timestamptz, integer, integer,
  double precision, double precision, boolean, uuid[]
) to service_role;

grant execute on function search.query_chunks(
  uuid, uuid, text, text, text, text, text[], text[], jsonb,
  timestamptz, timestamptz, integer, integer,
  double precision, double precision, boolean, uuid[]
) to engenty_server;

notify pgrst, 'reload schema';
