-- Link each catalog row to the sync run that last saw it, and record whether
-- that run inserted it, changed catalog fields/prices, or left it unchanged.
-- `updated_at` stays at insert time until a sync reports a real change.

alter table ai.model
  add column last_sync_run_id uuid null
    references ai.gateway_model_sync_run (id),
  add column last_sync_change text null
    constraint model_last_sync_change_check
      check (
        last_sync_change is null
        or last_sync_change = any (array['new'::text, 'changed'::text, 'unchanged'::text])
      );

create index model_last_sync_run_idx on ai.model using btree (last_sync_run_id);
create index model_updated_at_idx on ai.model using btree (updated_at desc);
create index model_last_synced_at_idx on ai.model using btree (last_synced_at desc);
