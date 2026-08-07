-- Extend ai.merge_thread_metadata with set-union append.
--
-- The 5-arg version only does a shallow `||`, which is correct for keys whose
-- value is replaced wholesale (ag_ui_open_interrupt, active_artifact, agent
-- state). It is NOT enough for the tool-approval grant lists: those are arrays
-- appended to, so a caller has to read the current array to build the new one
-- — and computing `{key: [...read, new]}` then merging it replaces the whole
-- array, silently dropping any grant added in between. Same lost update as the
-- one this function was introduced to fix, one level down.
--
-- p_append_sets is {"key": ["value", ...]}: each listed value is unioned into
-- the array already at that key, evaluated against the CURRENT row. Duplicates
-- collapse, which matches the callers — the grant helpers are idempotent.
--
-- Order is patch, then append, then remove, so a caller can replace a key and
-- append to a different one in the same statement, and removal always wins.
--
-- Drops the 5-arg signature rather than overloading it: two functions differing
-- only by a trailing argument is exactly the ambiguity PostgREST resolves badly,
-- and nothing has shipped against the old one yet.
drop function if exists ai.merge_thread_metadata(uuid, uuid, uuid, jsonb, text[]);

create or replace function ai.merge_thread_metadata(
  p_tenant_id uuid,
  p_thread_id uuid,
  p_user_id uuid,
  p_patch jsonb,
  p_remove_keys text[],
  p_append_sets jsonb
) returns setof ai.thread
language sql
set search_path = ''
as $$
  update ai.thread
  set metadata = (
    select
      (
        coalesce(metadata, '{}'::jsonb)
        || coalesce(p_patch, '{}'::jsonb)
        || coalesce(
             (
               -- For each key in p_append_sets, union its values into the
               -- array currently stored at that key.
               select jsonb_object_agg(
                 appended.key,
                 appended.merged
               )
               from (
                 select
                   entry.key as key,
                   (
                     select jsonb_agg(distinct value_element)
                     from jsonb_array_elements(
                       coalesce(
                         case
                           when jsonb_typeof(coalesce(metadata, '{}'::jsonb) -> entry.key) = 'array'
                             then coalesce(metadata, '{}'::jsonb) -> entry.key
                           else '[]'::jsonb
                         end,
                         '[]'::jsonb
                       ) || entry.value
                     ) as value_element
                   ) as merged
                 from jsonb_each(coalesce(p_append_sets, '{}'::jsonb)) as entry
               ) as appended
             ),
             '{}'::jsonb
           )
      ) - coalesce(p_remove_keys, array[]::text[])
  )
  where tenant_id = p_tenant_id
    and id = p_thread_id
    and created_by_user_id = p_user_id
  returning *;
$$;

revoke all on function ai.merge_thread_metadata(
  uuid, uuid, uuid, jsonb, text[], jsonb
) from public;

grant execute on function ai.merge_thread_metadata(
  uuid, uuid, uuid, jsonb, text[], jsonb
) to service_role;
