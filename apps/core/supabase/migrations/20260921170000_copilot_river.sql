-- The copilot's conversations become one: the river — a person's private,
-- tenant-wide DM with the copilot, opened on first use with the same stable id
-- every time (apps/ai room-routes `dmThreadId` with no Space). The per-space
-- copilot threads that existed before it are not carried over: no import, no
-- redirect, no orphan rows. Every dependent table cascades on the thread.
delete from ai.thread where agent_id = 'engenty.copilot';

-- Chapters of the river.
--
-- The river is one conversation per person with their copilot, without end.
-- A chapter is a compaction point cut into it: a stretch of turns — a day, a
-- week, or "everything since the last one", on request — summarised once and
-- kept, with the spaces the person stood in during it and the things worth
-- keeping in mind afterwards. "What did we discuss last Tuesday?" is a read
-- over this table; jumping back to "Tuesday in engrd" is a row of it.
--
-- Private to its person like the river itself: the copilot's DM is visible to
-- exactly one user, and so is every chapter of it.
create table ai.thread_compaction (
  id uuid primary key default public.uuidv7(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  thread_id uuid not null references ai.thread(id) on delete cascade,
  user_id uuid not null,
  kind text not null,
  range_start timestamptz not null,
  range_end timestamptz not null,
  message_count integer not null default 0,
  -- [{ id, key }] — the spaces whose turns this chapter covers.
  spaces jsonb not null default '[]'::jsonb,
  title text not null,
  summary text not null,
  -- [{ text, space_key? }] — what to keep in mind after this stretch.
  keep_in_mind jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint thread_compaction_kind_check
    check (kind in ('manual', 'daily', 'weekly')),
  constraint thread_compaction_range_check check (range_end >= range_start)
);

comment on table ai.thread_compaction is
  'A chapter of a person''s river (their one copilot conversation): a stretch of turns summarised once — daily, weekly, or on request — with the spaces it happened in and what to keep in mind.';

create index thread_compaction_thread_idx
  on ai.thread_compaction (tenant_id, thread_id, range_end desc);

alter table ai.thread_compaction enable row level security;

create policy srv_tenant_isolation on ai.thread_compaction to engenty_server
  using (tenant_id = (select core.current_tenant_id()))
  with check (tenant_id = (select core.current_tenant_id()));

create policy thread_compaction_select on ai.thread_compaction
  for select to authenticated
  using (
    tenant_id = core.current_tenant_id()
    and user_id = core.current_user_id()
  );

grant select, insert, delete, update on table ai.thread_compaction to service_role;
grant select, insert, delete, update on table ai.thread_compaction to engenty_server;
grant select on table ai.thread_compaction to authenticated;

-- The alter ego: when a person's copilot sits in a room, it sits there FOR
-- that person. The room's other readers see "Matthias' Copilot", never a
-- second anonymous copilot — and never the private river behind it.
alter table ai.thread_agent add column on_behalf_of_user_id uuid;

comment on column ai.thread_agent.on_behalf_of_user_id is
  'Set on a copilot member row: the person whose copilot this is. The room shows the agent as that person''s copilot; the copilot''s own conversation with them stays private.';
