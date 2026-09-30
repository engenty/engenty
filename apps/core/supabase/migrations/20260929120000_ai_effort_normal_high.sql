-- The graded tiers collapse from low / medium / high to normal / high — the
-- composer's Normal and Extra. `model.normal` takes over where model.low was
-- bound (the cheap everyday model); model.medium goes. Stored tiers follow:
-- low and medium both become normal.
insert into ai.model_binding (scope, role, model_id, gateway)
select scope, 'model.normal', model_id, gateway
from ai.model_binding
where role = 'model.low'
on conflict (scope, role) do nothing;

delete from ai.model_binding
where role in ('model.low', 'model.medium');

alter table ai.engenty_ai_agents
  drop constraint engenty_ai_agents_effort_check;

update ai.engenty_ai_agents
set effort = 'normal'
where effort in ('low', 'medium');

alter table ai.engenty_ai_agents
  add constraint engenty_ai_agents_effort_check
  check (effort is null or effort = any (array['normal'::text, 'high'::text]));

-- A plan granting any of low / medium grants normal; a list that ends up with
-- both tiers is unrestricted (null), which is how "all" is stored.
create or replace function pg_temp.collapse_efforts(efforts text[])
returns text[]
language sql
immutable
as $$
  select case
    when efforts is null then null
    else (
      select case
        when count(*) = 0 then null
        when count(*) = 2 then null
        else array_agg(tier order by tier desc)
      end
      from (
        select distinct case when e in ('low', 'medium') then 'normal' else e end as tier
        from unnest(efforts) as e
        where e in ('low', 'medium', 'high', 'normal')
      ) as tiers
    )
  end
$$;

update ai.tenant_usage_policy
set allowed_efforts = pg_temp.collapse_efforts(allowed_efforts)
where allowed_efforts is not null;

comment on column ai.tenant_usage_policy.allowed_efforts is
  'Licensed effort tiers (normal/high — the composer''s Normal and Extra). NULL/empty = both. Requests above the ceiling degrade to normal rather than failing.';

update core.packages
set ai_usage_policy = jsonb_set(
  ai_usage_policy,
  '{allowed_efforts}',
  coalesce(
    to_jsonb(pg_temp.collapse_efforts(
      array(select jsonb_array_elements_text(ai_usage_policy -> 'allowed_efforts'))
    )),
    'null'::jsonb
  )
)
where jsonb_typeof(ai_usage_policy -> 'allowed_efforts') = 'array';

update core.tenant_entitlement_overrides
set override = jsonb_set(
  override,
  '{aiUsagePolicy,allowed_efforts}',
  coalesce(
    to_jsonb(pg_temp.collapse_efforts(
      array(select jsonb_array_elements_text(override -> 'aiUsagePolicy' -> 'allowed_efforts'))
    )),
    'null'::jsonb
  )
)
where jsonb_typeof(override -> 'aiUsagePolicy' -> 'allowed_efforts') = 'array';

-- Platform-wide AI settings that are not a role binding. First key:
-- `custom_models` = { enabled, models: [ref…] } — the composer's Custom list.
create table ai.platform_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  constraint platform_config_key_check check (key <> '')
);

comment on table ai.platform_config is
  'Platform-wide AI settings beside the role bindings (e.g. custom_models). Superadmin-edited in the binding console; shipped in apps/ai/config/default-models.json.';

alter table ai.platform_config enable row level security;

grant select, insert, update, delete on table ai.platform_config to service_role;
