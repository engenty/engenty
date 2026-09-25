-- Model roles collapse to three job classes: graded chat (model.low/medium/
-- high), `classifier` (pick-one-of-N, Jev-like) and `fast_text` (short prose,
-- no tools). router/memory work moves to fast_text or classifier,
-- planning_coding to model.high, research had no users, safeguard runs on the
-- classifier. Their bindings go; fast_text starts where model.low is bound.
insert into ai.model_binding (scope, role, model_id, gateway)
select scope, 'fast_text', model_id, gateway
from ai.model_binding
where role = 'model.low'
on conflict (scope, role) do nothing;

delete from ai.model_binding
where role in ('router', 'safeguard', 'planning_coding', 'research', 'memory');
