-- Actions become specialist-owned Mastra workflows (PLAN-mounted-engentys T4.1).
--
-- `owner_agent_id` (decision B): text, matching `ai.routines.agent_id` — the
-- registry's stable key, not a uuid. NULL = library (the shared subset).
-- `title`: generated once at save when absent; `name` stays the stable key.
-- The unique key widens to (tenant, owner, name): the same name may exist per
-- specialist and once in the library.
--
-- DESTRUCTIVE BY POLICY (cutover rules 2026-08-29): existing flow graphs,
-- versions, runs and routine rows are wiped rather than converted. Module
-- workflows re-reconcile on boot; tenant-authored ones are lost by declared
-- policy.

truncate table ai.routines cascade;
truncate table ai.action_request cascade;
truncate table ai.flow_graph_version cascade;
truncate table ai.flow_graph cascade;

alter table ai.flow_graph
  add column if not exists owner_agent_id text,
  add column if not exists title text;

drop index if exists ai.flow_graph_tenant_name_idx;
create unique index flow_graph_tenant_owner_name_idx
  on ai.flow_graph (tenant_id, coalesce(owner_agent_id, ''), name);
