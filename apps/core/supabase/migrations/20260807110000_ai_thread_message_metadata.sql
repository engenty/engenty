-- Give ai.thread_message somewhere to keep Mastra's message metadata.
--
-- Mastra hangs meaning off `content.metadata`: a state signal's identity lives
-- there (`metadata.signal = {id, type:"state", …}`), and it is how
-- getActiveStateSignals reconstructs signals when a thread is loaded. Our
-- storage mapped messages into this table as {role, parts, author_user_id}
-- only, so that metadata was dropped on write — signals came back as inert
-- system text and the agent could not see them at all.
--
-- Not specific to state signals: anything Mastra puts in message metadata was
-- being discarded here.
--
-- Default '{}' rather than null so readers never have to distinguish "no
-- metadata" from "old row", and NOT NULL so the shape is total.
alter table ai.thread_message
  add column if not exists metadata jsonb not null default '{}'::jsonb;

comment on column ai.thread_message.metadata is
  'Mastra message metadata (content.metadata) — carries state-signal identity and provider metadata. Preserved verbatim by EngentySessionMemoryStorage; author_user_id is projected on read and is not stored here.';
