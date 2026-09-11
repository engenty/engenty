-- Ring 4 of the flow_graph rename: the tool ids.
--
-- `invoke_action` -> `invoke_flow` and `action_graph_propose` ->
-- `flow_graph_propose`. The ids themselves live in code, but any CUSTOM agent
-- that declared one carries the old string in `ai.engenty_ai_agents.tool_ids`
-- (jsonb array) — the one place in this whole rename a compiler cannot see.
-- Renaming the constant without this rewrite silently strands such an agent:
-- its declared id resolves to nothing and the tool just disappears from its
-- surface.
--
-- On the feat/spaces dev stack zero rows carry either id; this exists so any
-- installation where a human DID declare them migrates instead of breaking.
-- Idempotent: rows without the ids are untouched, a second run matches
-- nothing.

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
          when 'invoke_action' then 'invoke_flow'
          when 'action_graph_propose' then 'flow_graph_propose'
          else entry
        end
      ),
      '[]'::jsonb
    )
    from jsonb_array_elements_text(tool_ids) as t(entry)
  )
  where tool_ids ?| array['invoke_action', 'action_graph_propose'];
end $$;
