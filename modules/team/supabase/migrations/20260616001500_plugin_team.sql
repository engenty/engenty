-- Team module baseline (pre-launch, profile-only).
-- Core team owns the directory: profiles (members that can be people or agents),
-- taxonomies, org graph, groups, and custom field definitions. HR/employment data
-- (employees, contracts, gallery, employment time) lives in the optional team-hr
-- module and depends on module_team.profiles — see modules/team-hr.

create schema if not exists module_team;

-- Directory profile for internal, external, and contractor members.
-- Auth link: user_id = "logs in as this profile".
create table module_team.profiles (
  id text primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  user_id uuid references core.users(id) on delete set null,
  member_type text not null default 'internal'
    check (member_type in ('internal', 'external', 'contractor')),
  full_name text not null,
  name_prefix text,
  first_name text,
  middle_name text,
  last_name text,
  name_suffix text,
  phonetic_name text,
  birth_name text,
  full_name_override text,
  initials text,
  phone text,
  email text,
  position text,
  department text,
  location text,
  profile_image_storage_key text,
  import_id text,
  last_imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table module_team.profiles is
  'Directory profile for internal, external, and contractor members.';
comment on column module_team.profiles.profile_image_storage_key is
  'Vault key for public profile picture: tenants/<tenant>/team/members/<profile_id>/profile/...';

create index idx_module_team_profiles_scope
  on module_team.profiles (tenant_id, scope_id, updated_at desc);

create index idx_module_team_profiles_user
  on module_team.profiles (user_id) where user_id is not null;

create index idx_module_team_profiles_import_id
  on module_team.profiles (tenant_id, scope_id, import_id)
  where import_id is not null;

create index idx_module_team_profiles_email_lower
  on module_team.profiles (tenant_id, scope_id, lower(email))
  where email is not null;

-- Taxonomy dimensions (tenant-wide).
create table module_team.taxonomies (
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  slug text not null,
  label text not null,
  builtin text null check (builtin is null or builtin in ('role', 'location', 'group-type')),
  target text not null check (target in ('profile', 'group')),
  supports_order boolean not null default false,
  supports_hierarchy boolean not null default false,
  cardinality text not null default 'single' check (cardinality in ('single', 'multiple')),
  filterable boolean not null default true,
  sort_order int not null default 0,
  config jsonb not null default '{}'::jsonb,
  deletable boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, slug)
);

create table module_team.taxonomy_terms (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null,
  taxonomy_slug text not null,
  term_slug text not null,
  label text not null,
  parent_term_id uuid null references module_team.taxonomy_terms (id) on delete restrict,
  sort_order int not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, taxonomy_slug)
    references module_team.taxonomies (tenant_id, slug) on delete cascade
);

create unique index idx_taxonomy_terms_slug
  on module_team.taxonomy_terms (tenant_id, taxonomy_slug, term_slug);

create index idx_taxonomy_terms_taxonomy
  on module_team.taxonomy_terms (tenant_id, taxonomy_slug);

create index idx_taxonomy_terms_parent
  on module_team.taxonomy_terms (tenant_id, taxonomy_slug, parent_term_id);

create table module_team.profile_taxonomy_assignments (
  tenant_id uuid not null,
  profile_id text not null references module_team.profiles(id) on delete cascade,
  taxonomy_slug text not null,
  term_id uuid not null references module_team.taxonomy_terms (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, taxonomy_slug, term_id)
);

create table module_team.org_nodes (
  id text primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  node_kind text not null check (node_kind in ('human', 'agent')),
  profile_id text null references module_team.profiles(id) on delete cascade,
  agent_id text null,
  display_name text not null,
  display_title text null,
  icon text null,
  status text null,
  reports_to_id text null references module_team.org_nodes(id) on delete set null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint org_nodes_human_agent_xor check (
    (node_kind = 'human' and profile_id is not null and agent_id is null)
    or (node_kind = 'agent' and agent_id is not null and profile_id is null)
  )
);

create unique index idx_org_nodes_profile
  on module_team.org_nodes (tenant_id, profile_id) where profile_id is not null;

create index idx_org_nodes_tenant_reports_to
  on module_team.org_nodes (tenant_id, reports_to_id);

create table module_team.groups (
  id text primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  name text not null,
  description text null,
  type_term_id uuid not null references module_team.taxonomy_terms (id) on delete restrict,
  lead_org_node_id text null references module_team.org_nodes(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table module_team.group_members (
  tenant_id uuid not null,
  group_id text not null references module_team.groups(id) on delete cascade,
  org_node_id text not null references module_team.org_nodes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, org_node_id)
);

-- Tenant-wide custom field definitions for team member profiles.
create table module_team.member_field_definitions (
  id text primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  visibility text not null check (visibility in ('shared', 'private', 'employment')),
  field_type text not null check (
    field_type in (
      'text_input',
      'text_formatted',
      'text_tiptap',
      'number',
      'date',
      'date_range',
      'url',
      'image',
      'file',
      'select'
    )
  ),
  label text not null,
  description text not null default '',
  field_key text not null,
  options jsonb not null default '[]'::jsonb,
  sort_order int not null default 0,
  multiple boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, field_key)
);

create index idx_member_field_definitions_tenant_visibility_sort
  on module_team.member_field_definitions (tenant_id, visibility, sort_order);

-- RLS
alter table module_team.profiles enable row level security;
alter table module_team.taxonomies enable row level security;
alter table module_team.taxonomy_terms enable row level security;
alter table module_team.profile_taxonomy_assignments enable row level security;
alter table module_team.org_nodes enable row level security;
alter table module_team.groups enable row level security;
alter table module_team.group_members enable row level security;
alter table module_team.member_field_definitions enable row level security;

create policy profiles_read_own_scope on module_team.profiles
for select using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy profiles_insert_own_scope on module_team.profiles
for insert with check (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy profiles_update_own_scope on module_team.profiles
for update using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy profiles_delete_own_scope on module_team.profiles
for delete using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy taxonomies_tenant on module_team.taxonomies
  for all using (tenant_id = core.current_tenant_id());

create policy taxonomy_terms_tenant on module_team.taxonomy_terms
  for all using (tenant_id = core.current_tenant_id());

create policy profile_taxonomy_assignments_tenant on module_team.profile_taxonomy_assignments
  for all using (tenant_id = core.current_tenant_id());

create policy org_nodes_tenant on module_team.org_nodes
  for all using (tenant_id = core.current_tenant_id());

create policy groups_tenant on module_team.groups
  for all using (tenant_id = core.current_tenant_id());

create policy group_members_tenant on module_team.group_members
  for all using (tenant_id = core.current_tenant_id());

create policy member_field_definitions_tenant on module_team.member_field_definitions
  for all using (tenant_id = core.current_tenant_id());

-- Grants
grant usage on schema module_team to service_role;
grant select, insert, update, delete on module_team.profiles to service_role;
grant select, insert, update, delete on module_team.taxonomies to service_role;
grant select, insert, update, delete on module_team.taxonomy_terms to service_role;
grant select, insert, update, delete on module_team.profile_taxonomy_assignments to service_role;
grant select, insert, update, delete on module_team.org_nodes to service_role;
grant select, insert, update, delete on module_team.groups to service_role;
grant select, insert, update, delete on module_team.group_members to service_role;
grant select, insert, update, delete on module_team.member_field_definitions to service_role;

notify pgrst, 'reload schema';
