-- Catalog availability follows the model roles: agent (model.low/medium/high),
-- classification (classifier, Jev only), text (fast_text), realtime (voice),
-- plus the unchanged embedding / image / video / rerank.
alter table ai.model rename column available_for_chat to available_for_agent;
alter table ai.model rename column available_for_routing to available_for_classification;
alter index ai.model_available_chat_idx rename to model_available_agent_idx;
alter index ai.model_available_routing_idx rename to model_available_classification_idx;

alter table ai.model
  add column available_for_text boolean default false not null,
  add column available_for_realtime boolean default false not null;

-- Short text runs on any model that could run an agent turn.
update ai.model set available_for_text = available_for_agent;
-- Classification was on for every text model; only Jev classifies now.
update ai.model
  set available_for_classification = model_id ilike 'typesafe-ai/jev%';

create index model_available_text_idx on ai.model using btree (model_id)
  where available_for_text;
create index model_available_realtime_idx on ai.model using btree (model_id)
  where available_for_realtime;
