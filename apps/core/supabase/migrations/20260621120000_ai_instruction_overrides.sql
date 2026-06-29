-- Rebuild of the AI instruction-editing surface on apps/ai (schema-split follow-up).
--
-- The legacy core.engenty_instruction_docs/_changes tables were dropped in
-- 20260521190000_drop_core_instruction_docs.sql because base prompt content now
-- lives in files (module ai/ trees, apps/core/ai/agents/* markdown, apps/ai
-- workspace). This migration recreates ONLY the editable layers — tenant and
-- user overrides — in the `ai` schema (owned by apps/ai). Base/agent/module/action
-- documents are derived live from the apps/ai registry and are never stored here.

create table if not exists ai.engenty_instruction_overrides (
  id uuid primary key default public.uuidv7(),
  tenant_id uuid references core.tenants(id) on delete cascade,
  module_id text not null,
  document_key text not null,
  layer text not null
    check (layer in ('tenant_override', 'user_override')),
  title text not null,
  body text not null,
  created_by_user_id uuid references core.users(id) on delete set null,
  updated_by_user_id uuid references core.users(id) on delete set null,
  source_kind text not null default 'user'
    check (source_kind in ('seed', 'user', 'agent_proposal', 'agent_approved')),
  version integer not null default 1,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_engenty_instruction_overrides_lookup
  on ai.engenty_instruction_overrides (tenant_id, document_key, layer, created_by_user_id, is_active, version desc);

create index if not exists idx_engenty_instruction_overrides_module_id
  on ai.engenty_instruction_overrides (module_id);

create table if not exists ai.engenty_instruction_changes (
  id uuid primary key default public.uuidv7(),
  instruction_doc_id uuid not null
    references ai.engenty_instruction_overrides(id) on delete cascade,
  proposed_by_run_id uuid,
  approved_by_user_id uuid references core.users(id) on delete set null,
  approved_at timestamptz,
  status text not null default 'applied'
    check (status in ('proposed', 'approved', 'rejected', 'applied')),
  previous_body text,
  next_body text not null,
  change_reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_engenty_instruction_changes_doc_id
  on ai.engenty_instruction_changes (instruction_doc_id, created_at desc);

-- RLS mirrors the sibling ai.engenty_ai_* tables. apps/ai reaches these via the
-- service-role key (which bypasses RLS) and scopes every query by tenant_id in
-- the DAL; the policies below keep direct authenticated access tenant-isolated.
alter table ai.engenty_instruction_overrides enable row level security;

create policy engenty_instruction_overrides_select on ai.engenty_instruction_overrides
  for select using (tenant_id = core.current_tenant_id());
create policy engenty_instruction_overrides_insert on ai.engenty_instruction_overrides
  for insert with check (tenant_id = core.current_tenant_id());
create policy engenty_instruction_overrides_update on ai.engenty_instruction_overrides
  for update using (tenant_id = core.current_tenant_id());
create policy engenty_instruction_overrides_delete on ai.engenty_instruction_overrides
  for delete using (tenant_id = core.current_tenant_id());

alter table ai.engenty_instruction_changes enable row level security;

create policy engenty_instruction_changes_select on ai.engenty_instruction_changes
  for select using (exists (
    select 1 from ai.engenty_instruction_overrides o
    where o.id = instruction_doc_id and o.tenant_id = core.current_tenant_id()
  ));
create policy engenty_instruction_changes_insert on ai.engenty_instruction_changes
  for insert with check (exists (
    select 1 from ai.engenty_instruction_overrides o
    where o.id = instruction_doc_id and o.tenant_id = core.current_tenant_id()
  ));

grant select, insert, delete, update on table ai.engenty_instruction_overrides to service_role;
grant select, insert, delete, update on table ai.engenty_instruction_overrides to authenticated;
grant select, insert, delete, update on table ai.engenty_instruction_changes to service_role;
grant select, insert, delete, update on table ai.engenty_instruction_changes to authenticated;
