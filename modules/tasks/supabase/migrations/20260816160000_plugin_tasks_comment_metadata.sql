-- A question comment carries HOW it can be answered.
--
-- `task_ask_user` could only ever produce a prose question and a free-text
-- reply box. Most of what an agent actually needs to ask is a choice — which
-- of these three, may I proceed, which of these apply — and asking that as
-- prose makes the person retype an option the agent already enumerated, then
-- makes the agent re-parse it. ENG-47 asked "Choose one: #E63946 (red),
-- #2A9D8F (teal), or #F4A261 (orange)" into a textarea.
--
-- The shape rides in `metadata`, not in the text, for the same reason `kind`
-- does: nothing should have to parse a sentence to know it is a multiple
-- choice. For a question the payload is
--   { "answer_type": "text" | "confirm" | "single_choice" | "multi_choice",
--     "options": [{ "value": "...", "label": "..." }] }
-- and the column stays free-form for whatever later kinds need to carry.

alter table module_tasks.task_comments
  add column if not exists metadata jsonb not null default '{}'::jsonb;

comment on column module_tasks.task_comments.metadata is
  'Kind-specific payload. For kind=question: answer_type + options, so the UI can render the right control instead of parsing the prose.';
