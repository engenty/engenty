-- Consolidated pdf-templates baseline (pre-launch).

-- >>> from 20260320123000_plugin_pdf_templates.sql
-- Squashed pdf-templates baseline (pre-launch).

-- >>> from 20260320123000_plugin_pdf_templates.sql
create schema if not exists module_pdf_templates;

create table if not exists module_pdf_templates.templates (
  id text primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  module_key text not null,
  name text not null,
  is_default boolean not null default false,
  settings_json jsonb not null default '{}'::jsonb,
  schema_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists module_pdf_templates.template_documents (
  id text primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  template_id text not null references module_pdf_templates.templates(id) on delete cascade,
  document_key text not null default 'default',
  engine text not null default 'xml_liquid_v1',
  document_template text not null,
  stylesheet_template text not null,
  input_schema_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_module_pdf_templates_scope
  on module_pdf_templates.templates (tenant_id, scope_id, module_key, name);

create unique index if not exists idx_module_pdf_templates_default
  on module_pdf_templates.templates (tenant_id, scope_id, module_key)
  where is_default = true and deleted_at is null;

create unique index if not exists idx_module_pdf_template_documents_unique
  on module_pdf_templates.template_documents (template_id, document_key);

grant usage on schema module_pdf_templates to service_role;

grant select, insert, update, delete on module_pdf_templates.templates to service_role;
grant select, insert, update, delete on module_pdf_templates.template_documents to service_role;

alter table module_pdf_templates.templates enable row level security;
alter table module_pdf_templates.template_documents enable row level security;

create policy pdf_templates_read_own_scope on module_pdf_templates.templates
for select using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy pdf_templates_insert_own_scope on module_pdf_templates.templates
for insert with check (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy pdf_templates_update_own_scope on module_pdf_templates.templates
for update using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy pdf_templates_delete_own_scope on module_pdf_templates.templates
for delete using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy pdf_template_documents_read_own_scope on module_pdf_templates.template_documents
for select using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy pdf_template_documents_insert_own_scope on module_pdf_templates.template_documents
for insert with check (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy pdf_template_documents_update_own_scope on module_pdf_templates.template_documents
for update using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy pdf_template_documents_delete_own_scope on module_pdf_templates.template_documents
for delete using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

-- >>> from 20260320140000_plugin_pdf_templates_schema_usage.sql
-- Required for service_role / PostgREST: table grants are not enough without schema USAGE.
-- Safe if already applied (e.g. after updating the initial plugin migration on fresh installs).
grant usage on schema module_pdf_templates to service_role;
