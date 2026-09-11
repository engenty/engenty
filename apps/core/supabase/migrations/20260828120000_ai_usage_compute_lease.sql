-- Compute leases as a metered usage line.
--
-- Until now a usage event was always a model call, priced per token. A sandbox
-- lease costs real host resources and no tokens at all, so it needs a dimension
-- of its own rather than a fake model row: `compute_ms` on the event and on the
-- period rollup, and `space_id` so a tenant can see which space burned the host.
--
-- `space_id` is deliberately un-FK'd and nullable: a run may be global, and a
-- deleted space must not take its billing history with it.

alter table ai.usage_event
  add column if not exists compute_ms bigint not null default 0,
  add column if not exists space_id uuid;

alter table ai.usage_period_total
  add column if not exists compute_ms bigint not null default 0;

create index if not exists usage_event_space_time_idx
  on ai.usage_event using btree (space_id, occurred_at desc);

-- Signature changes, so the old overload has to go before the new one lands —
-- otherwise both exist and the RPC call is ambiguous.
drop function if exists ai.bump_usage_period_total(
  uuid, uuid, timestamptz, timestamptz, bigint, bigint, bigint, bigint,
  bigint, text, timestamptz
);

create function ai.bump_usage_period_total(
  p_tenant_id uuid,
  p_user_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_input_tokens bigint,
  p_output_tokens bigint,
  p_cached_tokens bigint,
  p_reasoning_tokens bigint,
  p_cost_micros bigint,
  p_currency text,
  p_occurred_at timestamptz,
  p_compute_ms bigint default 0
) returns void
  language sql
  as $$
  insert into ai.usage_period_total (
    tenant_id,
    user_id,
    period_start,
    period_end,
    input_tokens,
    output_tokens,
    cached_tokens,
    reasoning_tokens,
    compute_ms,
    cost_micros,
    currency,
    event_count,
    last_event_at,
    updated_at
  )
  values (
    p_tenant_id,
    p_user_id,
    p_period_start,
    p_period_end,
    p_input_tokens,
    p_output_tokens,
    p_cached_tokens,
    p_reasoning_tokens,
    p_compute_ms,
    p_cost_micros,
    p_currency,
    1,
    p_occurred_at,
    now()
  )
  on conflict (tenant_id, user_id, period_start)
  do update set
    period_end = excluded.period_end,
    input_tokens = ai.usage_period_total.input_tokens + excluded.input_tokens,
    output_tokens = ai.usage_period_total.output_tokens + excluded.output_tokens,
    cached_tokens = ai.usage_period_total.cached_tokens + excluded.cached_tokens,
    reasoning_tokens = ai.usage_period_total.reasoning_tokens + excluded.reasoning_tokens,
    compute_ms = ai.usage_period_total.compute_ms + excluded.compute_ms,
    cost_micros = ai.usage_period_total.cost_micros + excluded.cost_micros,
    currency = excluded.currency,
    event_count = ai.usage_period_total.event_count + 1,
    last_event_at = greatest(
      coalesce(ai.usage_period_total.last_event_at, '-infinity'::timestamptz),
      excluded.last_event_at
    ),
    updated_at = now();
$$;

grant all on function ai.bump_usage_period_total(
  uuid, uuid, timestamptz, timestamptz, bigint, bigint, bigint, bigint,
  bigint, text, timestamptz, bigint
) to service_role;
