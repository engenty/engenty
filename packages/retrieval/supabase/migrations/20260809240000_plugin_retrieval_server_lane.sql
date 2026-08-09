-- Server-lane read access to the retrieval visibility registry (Phase A, WP5).
--
-- search.source_visibility is platform config (source_type → module/visibility),
-- carries no tenant_id, and was deny-all for every non-service role. The
-- query_chunks RPC (SECURITY INVOKER) joins it, so tenant-locked retrieval
-- queries need read access — read-only: registration writes stay on the core
-- service lane (registerSourceVisibility at plugin boot).
--
-- Idempotent: drop-policy-first, re-grant.

grant select on search.source_visibility to engenty_server;

drop policy if exists srv_read_visibility on search.source_visibility;
create policy srv_read_visibility on search.source_visibility
  for select to engenty_server
  using (true);

notify pgrst, 'reload schema';
