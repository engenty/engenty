-- Shared specialist / standing task rooms: HITL metadata merges must succeed
-- for any caller the TypeScript gate already authorized, not only the thread
-- creator. Standing task threads have created_by_user_id NULL, so the owner
-- predicate never matched. Service-role only; apps/ai is the access check.
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
  returning *;
$$;
