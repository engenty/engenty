-- Realtime for the artifact pane live-cache (see packages/ai-ui/src/artifacts).
--
-- ai.artifact is tenant-scoped. The browser subscribes as the `authenticated` role,
-- so it needs schema usage + SELECT plus an RLS SELECT policy that realtime evaluates
-- per subscriber (only stream rows in the subscriber's current tenant). replica
-- identity full lets DELETEs carry tenant_id for filter matching.
--
-- Only ai.artifact is published: a new version bumps artifact.current_version /
-- updated_at, which is enough to invalidate the pane's queries. ai.artifact_version
-- is intentionally NOT published.

grant usage on schema ai to authenticated;
grant select on table ai.artifact to authenticated;

create policy artifact_select_tenant on ai.artifact
  for select to authenticated
  using (tenant_id = core.current_tenant_id());

alter table ai.artifact replica identity full;

do $$
begin
  alter publication supabase_realtime add table ai.artifact;
exception
  when duplicate_object then null;
end $$;
