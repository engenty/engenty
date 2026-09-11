-- D5: an event trigger may declare how its payload becomes a flow's input.
--
-- Before this, an event payload reached the materialized task as prose in the
-- description — readable by an agent, unreadable by a flow, which is why event
-- triggers could not usefully target one.
--
-- The value is a mapConfig in the SAME grammar the graph canvas uses for its
-- mapping nodes ({value} / {initData,path} / {template}), with the event
-- payload as `initData`. Null means the payload itself is the input.
alter table module_tasks.triggers
  add column if not exists input_mapping jsonb;

comment on column module_tasks.triggers.input_mapping is
  'Event payload -> flow input mapConfig (graph mapping grammar; payload = initData). Null = the payload is the input.';
