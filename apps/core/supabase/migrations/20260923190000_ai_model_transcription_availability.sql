-- The `transcription` role (speech to text for recorded audio) gets its own
-- catalog availability, like every other role class.
alter table ai.model
  add column available_for_transcription boolean default false not null;

update ai.model
  set available_for_transcription = true
  where model_id ~* '(whisper|transcribe)'
    and model_id !~* '(realtime|-live)'
    and (available_for_agent or available_for_text);

create index model_available_transcription_idx on ai.model using btree (model_id)
  where available_for_transcription;
