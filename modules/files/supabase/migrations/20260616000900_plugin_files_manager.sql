-- Consolidated files baseline (pre-launch).

-- >>> from 20260609120000_plugin_files_manager.sql
-- Files module: DB-backed file manager (folders + entries) for file "spaces".
--
-- A file space is identified by (tenant_id, owner_type, owner_id) — e.g. a
-- project. Folders form a tree via parent_id (NULL = space root). Entries are
-- file records that reference an opaque blob key in storage; the human path is
-- entirely in the DB, so rename/move are metadata-only and never copy bytes.
--
-- `source` distinguishes native files from Phase B connector sources
-- (google drive, dropbox, …). For native rows storage_key is set; connector
-- rows will set source_file_id instead.

create schema if not exists module_files;

-- ── Folders ───────────────────────────────────────────────────────────────
create table if not exists module_files.file_folders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  owner_type text not null,
  owner_id text not null,
  parent_id uuid references module_files.file_folders(id) on delete cascade,
  name text not null,
  source text not null default 'native'
    check (source in ('native', 'gdrive', 'dropbox', 'onedrive')),
  source_folder_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_module_files_folders_space
  on module_files.file_folders (tenant_id, owner_type, owner_id, parent_id);

-- Sibling folders must have unique names within a space + parent. Two partial
-- unique indexes cover the NULL-parent (root) and non-NULL cases since NULLs
-- are not considered equal by a plain unique constraint.
create unique index if not exists uq_module_files_folders_root_name
  on module_files.file_folders (tenant_id, owner_type, owner_id, lower(name))
  where parent_id is null;

create unique index if not exists uq_module_files_folders_child_name
  on module_files.file_folders (tenant_id, owner_type, owner_id, parent_id, lower(name))
  where parent_id is not null;

-- ── Entries (files) ───────────────────────────────────────────────────────
create table if not exists module_files.file_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  owner_type text not null,
  owner_id text not null,
  folder_id uuid references module_files.file_folders(id) on delete cascade,
  source text not null default 'native'
    check (source in ('native', 'gdrive', 'dropbox', 'onedrive')),
  storage_key text not null default '',
  source_file_id text,
  filename text not null,
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null default 0,
  status text not null default 'pending' check (status in ('pending', 'active')),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_module_files_entries_space
  on module_files.file_entries (tenant_id, owner_type, owner_id, folder_id);

create index if not exists idx_module_files_entries_status
  on module_files.file_entries (tenant_id, owner_type, owner_id, status);

create index if not exists idx_module_files_entries_storage_key
  on module_files.file_entries (storage_key);

-- ── Grants + RLS ──────────────────────────────────────────────────────────
-- Access is exclusively via the core API using the service_role key (which
-- bypasses RLS). RLS is enabled with no policies so no other role can reach
-- the data directly, matching the other module schemas.
grant usage on schema module_files to service_role;
grant select, insert, update, delete on module_files.file_folders to service_role;
grant select, insert, update, delete on module_files.file_entries to service_role;

alter table module_files.file_folders enable row level security;
alter table module_files.file_entries enable row level security;
