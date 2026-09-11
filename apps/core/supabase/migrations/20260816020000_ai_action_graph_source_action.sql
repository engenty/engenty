-- Phase 7 #4: a flow may BE an Action, compiled from its ACTION.md.
--
-- The compiled flow has to be found again on every press — to run it, and to
-- notice the declaration changed and mint a new version. Name is not an
-- identity: a person may already have a flow called "Enhance contact", and
-- (tenant_id, name) is unique, so keying on it would either hijack their flow
-- or refuse to seed ours. This column says which declaration a row came FROM,
-- which is the only thing that stays stable across renames.
--
-- Null on every hand- and LLM-authored flow, which is exactly the distinction:
-- a row with a source is derived and may be rewritten by a recompile; a row
-- without one belongs to whoever wrote it.
alter table "ai"."action_graph"
  add column if not exists "source_action_id" "text";

create unique index if not exists "action_graph_tenant_source_action_idx"
  on "ai"."action_graph" ("tenant_id", "source_action_id")
  where "source_action_id" is not null;

comment on column "ai"."action_graph"."source_action_id" is
  'ACTION.md id this flow was compiled from (Phase 7 #4). Null = authored, not derived.';
