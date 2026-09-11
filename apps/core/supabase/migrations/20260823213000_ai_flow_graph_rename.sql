-- flow_graph: the definition gets its own name.
--
-- `ai.action_graph` held every governed flow — pressed as a button, targeted
-- by a routine, called by an agent through invoke_action, run from the canvas.
-- "Action" names the FIRST of those callers, promoted to the name of the thing
-- they all call, which is why a scheduled flow and a pressed button felt like
-- different species. The definition is a flow; "Action" survives only as the
-- shape a module-shipped, single-node, declared flow takes (ACTION.md).
--
-- Ring 1 of the rename: database objects only. TypeScript identifiers, HTTP
-- paths (/ai/v1/action-graphs, with a redirect window) and the tool ids
-- (invoke_action — stored in core.agents.tool_ids jsonb, needs a data
-- migration) follow in their own passes; until then the DALs map the new
-- column names back to the unchanged API field names at their boundary.
--
-- RENAME preserves data, FK targets, grants and policies (they bind by OID);
-- constraint renames carry their backing indexes with them. Guarded so a
-- database that already renamed (or a fresh one whose initial schema may one
-- day create flow_graph directly) passes through untouched.

do $$
begin
  if to_regclass('ai.action_graph') is null then
    return;
  end if;

  alter table "ai"."action_graph" rename to "flow_graph";
  alter table "ai"."action_graph_version" rename to "flow_graph_version";
  alter table "ai"."flow_graph_version" rename column "action_graph_id" to "flow_graph_id";
  alter table "ai"."action_request" rename column "action_graph_version_id" to "flow_graph_version_id";

  -- Constraints (renaming a pkey/unique constraint renames its index too).
  alter table "ai"."flow_graph" rename constraint "action_graph_pkey" to "flow_graph_pkey";
  alter table "ai"."flow_graph" rename constraint "action_graph_status_check" to "flow_graph_status_check";
  alter table "ai"."flow_graph" rename constraint "action_graph_active_needs_version" to "flow_graph_active_needs_version";
  alter table "ai"."flow_graph" rename constraint "action_graph_tenant_id_fkey" to "flow_graph_tenant_id_fkey";
  alter table "ai"."flow_graph" rename constraint "action_graph_created_by_user_id_fkey" to "flow_graph_created_by_user_id_fkey";

  alter table "ai"."flow_graph_version" rename constraint "action_graph_version_pkey" to "flow_graph_version_pkey";
  alter table "ai"."flow_graph_version" rename constraint "action_graph_version_unique" to "flow_graph_version_unique";
  alter table "ai"."flow_graph_version" rename constraint "action_graph_version_authored_by_check" to "flow_graph_version_authored_by_check";
  alter table "ai"."flow_graph_version" rename constraint "action_graph_version_action_graph_id_fkey" to "flow_graph_version_flow_graph_id_fkey";
  alter table "ai"."flow_graph_version" rename constraint "action_graph_version_tenant_id_fkey" to "flow_graph_version_tenant_id_fkey";
  alter table "ai"."flow_graph_version" rename constraint "action_graph_version_created_by_user_id_fkey" to "flow_graph_version_created_by_user_id_fkey";
  alter table "ai"."flow_graph_version" rename constraint "action_graph_version_approved_by_user_id_fkey" to "flow_graph_version_approved_by_user_id_fkey";

  alter table "ai"."action_request" rename constraint "action_request_action_graph_version_id_fkey" to "action_request_flow_graph_version_id_fkey";

  -- Plain indexes (not constraint-backed).
  alter index "ai"."action_graph_tenant_name_idx" rename to "flow_graph_tenant_name_idx";
  alter index "ai"."action_graph_tenant_source_action_idx" rename to "flow_graph_tenant_source_action_idx";
  alter index "ai"."action_graph_version_tenant_graph_idx" rename to "flow_graph_version_tenant_graph_idx";

  -- Policies keep working across a rename; renaming them keeps \d output honest.
  alter policy "action_graph_select" on "ai"."flow_graph" rename to "flow_graph_select";
  alter policy "action_graph_insert" on "ai"."flow_graph" rename to "flow_graph_insert";
  alter policy "action_graph_update" on "ai"."flow_graph" rename to "flow_graph_update";
  alter policy "action_graph_delete" on "ai"."flow_graph" rename to "flow_graph_delete";
  alter policy "action_graph_version_select" on "ai"."flow_graph_version" rename to "flow_graph_version_select";
  alter policy "action_graph_version_insert" on "ai"."flow_graph_version" rename to "flow_graph_version_insert";

  comment on table "ai"."flow_graph" is
    'Governed flow definitions (renamed from action_graph 2026-08-23 — "Action" names a caller, not the shape). source_action_id links a flow compiled from a module''s ACTION.md.';
  comment on column "ai"."action_request"."flow_graph_version_id" is
    'Pins a graph run to the exact immutable version it started on.';
end $$;
