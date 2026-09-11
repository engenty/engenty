-- The Action is the ONE user-facing entity; "flow" is only the internal shape
-- of its steps and must never surface in a tool id an agent declares or calls.
-- The 2026-08-24 rename briefly went the other way (`invoke_action` ->
-- `invoke_flow`, `action_graph_propose` -> `flow_graph_propose`,
-- 20260824010000); this reverses it and settles the ids for good:
--
--   invoke_flow        -> invoke_action
--   flow_graph_propose -> action_propose
--   flows_list         -> actions_list
--
-- The ids live in code, but any CUSTOM agent that declared one carries the
-- string in `ai.engenty_ai_agents.tool_ids` (jsonb array) — the one seam a
-- compiler cannot see. Also folds the pre-rename ids forward, so an
-- installation that skipped the intermediate state still lands right.
-- Idempotent: rows without the ids are untouched.

do $$
begin
  if to_regclass('ai.engenty_ai_agents') is null then
    return;
  end if;

  update ai.engenty_ai_agents
  set tool_ids = (
    select coalesce(
      jsonb_agg(
        case entry
          when 'invoke_flow' then 'invoke_action'
          when 'invoke_action' then 'invoke_action'
          when 'flow_graph_propose' then 'action_propose'
          when 'action_graph_propose' then 'action_propose'
          when 'flows_list' then 'actions_list'
          else entry
        end
      ),
      '[]'::jsonb
    )
    from jsonb_array_elements_text(tool_ids) as t(entry)
  )
  where tool_ids ?| array['invoke_flow', 'flow_graph_propose', 'flows_list', 'action_graph_propose'];
end $$;
