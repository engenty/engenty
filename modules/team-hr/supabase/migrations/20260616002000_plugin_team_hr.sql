-- team-hr baseline (pre-launch). HR/employment extension for the team module.
-- Owns the employee (HR) record, contracts, gallery photos, and the employment-time
-- vertical (public holidays, absences, time records, versioned working hours). Every
-- table keys to module_team.profiles(id); the FK direction is team-hr -> team, so core
-- team builds and runs without this module. Lives in the module_team schema alongside
-- core team (no core table points into HR).

create schema if not exists module_team;

-- Employee: confidential HR/employment data; one row per internal profile.
create table module_team.employees (
  id text primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  profile_id text not null references module_team.profiles(id) on delete cascade,
  employee_number text,
  job_title text,
  employment_status text check (employment_status in ('full_time', 'part_time', 'freelancer', 'contractor')),
  start_date date,
  end_date date,
  salary_monthly numeric(12,2),
  extras text,
  einstufung text,
  hourly_rate numeric(12,2),
  daily_rate numeric(12,2),
  private_phone text,
  private_email text,
  private_address text,
  emergency_contact text,
  birth_date date,
  birth_place text,
  nationality text,
  social_security_number text,
  tax_id text,
  tax_class text,
  health_insurance text,
  bank_name text,
  bank_iban text,
  bank_bic text,
  gender text check (gender in ('male', 'female', 'diverse', 'other')),
  marital_status text check (marital_status in ('single', 'married', 'divorced', 'widowed', 'registered_partnership')),
  religion text,
  disability_degree integer,
  weekly_hours numeric(5,2),
  children jsonb default '[]'::jsonb,
  jurisdiction text default 'AT',
  target_hours_by_day jsonb default '{"monday": 8, "tuesday": 8, "wednesday": 8, "thursday": 8, "friday": 8, "saturday": 0, "sunday": 0}'::jsonb,
  vacation_entitlement_yearly numeric(4,1) default 25.0,
  vacation_carryover numeric(4,1) default 0.0,
  overtime_starting_balance numeric(6,2) default 0.0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employees_profile_id_unique unique (profile_id)
);

comment on table module_team.employees is
  'HR/employment data; one row per internal profile. Owned by team-hr.';

create index idx_module_team_employees_profile
  on module_team.employees (profile_id);

create index idx_module_team_employees_scope
  on module_team.employees (tenant_id, scope_id);

create index idx_module_team_employees_status
  on module_team.employees (employment_status)
  where employment_status is not null;

-- Contract file metadata (file bytes live in the module-team-contracts vault bucket).
create table module_team.team_member_contracts (
  id text primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  profile_id text not null references module_team.profiles(id) on delete cascade,
  file_name text not null,
  file_path text not null,
  file_size integer not null,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid references core.users(id) on delete set null
);

comment on column module_team.team_member_contracts.profile_id is
  'Contracts attach to the profile identity.';

create index idx_module_team_member_contracts_scope
  on module_team.team_member_contracts (tenant_id, scope_id);

create index idx_module_team_member_contracts_profile
  on module_team.team_member_contracts (profile_id);

-- Employment-section gallery photos (file bytes in vault; metadata here).
create table module_team.team_member_gallery_photos (
  id text primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  profile_id text not null references module_team.profiles(id) on delete cascade,
  storage_key text not null,
  title text,
  alt_text text,
  copyright text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_module_team_gallery_photos_profile
  on module_team.team_member_gallery_photos (profile_id, sort_order);

create index idx_module_team_gallery_photos_scope
  on module_team.team_member_gallery_photos (tenant_id, scope_id);

-- Central public holidays calendar (tenant-scoped, no profile link).
create table module_team.public_holidays (
  id text primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  date date not null,
  jurisdiction text not null,
  name text not null,
  is_half_day boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index idx_module_team_public_holidays_unique_date
  on module_team.public_holidays (tenant_id, jurisdiction, date);

-- Absences (vacation, sick leave, carer leave, special leave, unpaid, time off in lieu).
create table module_team.absences (
  id text primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  profile_id text not null references module_team.profiles(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  absence_type text not null check (absence_type in ('vacation', 'sick_leave', 'carer_leave', 'special_leave', 'unpaid_leave', 'time_off_in_lieu')),
  status text not null check (status in ('pending', 'approved', 'rejected')),
  notes text,
  approved_by uuid references core.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_module_team_absences_profile
  on module_team.absences (tenant_id, profile_id, start_date desc);

-- Employment daily actual time records.
create table module_team.employment_time_records (
  id text primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  profile_id text not null references module_team.profiles(id) on delete cascade,
  date date not null,
  clock_in time without time zone,
  clock_out time without time zone,
  break_minutes integer not null default 0,
  actual_hours numeric(4,2) not null check (actual_hours >= 0),
  target_hours numeric(4,2) not null check (target_hours >= 0),
  absence_type text check (absence_type in ('vacation', 'sick_leave', 'carer_leave', 'special_leave', 'unpaid_leave', 'time_off_in_lieu', 'holiday', 'home_office', 'travel')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index idx_module_team_time_records_unique
  on module_team.employment_time_records (profile_id, date);

create index idx_module_team_time_records_lookup
  on module_team.employment_time_records (tenant_id, profile_id, date desc);

-- Versioned regular working hours (Normalarbeitszeit).
create table module_team.employee_working_hours (
  id text primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  profile_id text not null references module_team.profiles(id) on delete cascade,
  start_date date not null,
  end_date date check (end_date is null or end_date >= start_date),
  weekly_hours numeric(4,1) not null check (weekly_hours >= 0),
  schedule jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_module_team_working_hours_profile
  on module_team.employee_working_hours (tenant_id, profile_id, start_date desc);

-- Contract file storage bucket (server-first mode).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'module-team-contracts',
  'module-team-contracts',
  false,
  10485760,
  array['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']::text[]
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- RLS
alter table module_team.employees enable row level security;
alter table module_team.team_member_contracts enable row level security;
alter table module_team.team_member_gallery_photos enable row level security;
alter table module_team.public_holidays enable row level security;
alter table module_team.absences enable row level security;
alter table module_team.employment_time_records enable row level security;
alter table module_team.employee_working_hours enable row level security;

create policy employees_read_own_scope on module_team.employees
for select using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy employees_insert_own_scope on module_team.employees
for insert with check (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy employees_update_own_scope on module_team.employees
for update using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy employees_delete_own_scope on module_team.employees
for delete using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy team_member_contracts_read_own_scope on module_team.team_member_contracts
for select using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy team_member_contracts_insert_own_scope on module_team.team_member_contracts
for insert with check (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy team_member_contracts_update_own_scope on module_team.team_member_contracts
for update using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy team_member_contracts_delete_own_scope on module_team.team_member_contracts
for delete using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy team_member_gallery_photos_read_own_scope on module_team.team_member_gallery_photos
for select using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy team_member_gallery_photos_insert_own_scope on module_team.team_member_gallery_photos
for insert with check (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy team_member_gallery_photos_update_own_scope on module_team.team_member_gallery_photos
for update using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy team_member_gallery_photos_delete_own_scope on module_team.team_member_gallery_photos
for delete using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy public_holidays_all_own_scope on module_team.public_holidays
  for all using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy absences_all_own_scope on module_team.absences
  for all using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy time_records_all_own_scope on module_team.employment_time_records
  for all using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

create policy working_hours_all_own_scope on module_team.employee_working_hours
  for all using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));

-- Grants
grant usage on schema module_team to service_role;
grant select, insert, update, delete on module_team.employees to service_role;
grant select, insert, update, delete on module_team.team_member_contracts to service_role;
grant select, insert, update, delete on module_team.team_member_gallery_photos to service_role;
grant select, insert, update, delete on module_team.public_holidays to service_role;
grant select, insert, update, delete on module_team.absences to service_role;
grant select, insert, update, delete on module_team.employment_time_records to service_role;
grant select, insert, update, delete on module_team.employee_working_hours to service_role;

-- Realtime: authenticated SELECT + publication + full replica identity for the
-- HR live-cache signals (employees, contracts, gallery).
grant usage on schema module_team to authenticated;
grant select on table module_team.employees to authenticated;
grant select on table module_team.team_member_contracts to authenticated;
grant select on table module_team.team_member_gallery_photos to authenticated;

alter table module_team.employees replica identity full;
alter table module_team.team_member_contracts replica identity full;
alter table module_team.team_member_gallery_photos replica identity full;

do $$
begin
  alter publication supabase_realtime add table module_team.employees;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table module_team.team_member_contracts;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table module_team.team_member_gallery_photos;
exception
  when duplicate_object then null;
end $$;

-- Pre-seed Austrian public holidays for 2026 so the calendar has immediate data.
insert into module_team.public_holidays (id, tenant_id, scope_id, date, jurisdiction, name)
select 'holiday-at-2026-01-01-' || id, id, 'default', '2026-01-01'::date, 'AT', 'Neujahr' from core.tenants union all
select 'holiday-at-2026-01-06-' || id, id, 'default', '2026-01-06'::date, 'AT', 'Heilige Drei Könige' from core.tenants union all
select 'holiday-at-2026-04-06-' || id, id, 'default', '2026-04-06'::date, 'AT', 'Ostermontag' from core.tenants union all
select 'holiday-at-2026-05-01-' || id, id, 'default', '2026-05-01'::date, 'AT', 'Staatsfeiertag' from core.tenants union all
select 'holiday-at-2026-05-14-' || id, id, 'default', '2026-05-14'::date, 'AT', 'Christi Himmelfahrt' from core.tenants union all
select 'holiday-at-2026-05-25-' || id, id, 'default', '2026-05-25'::date, 'AT', 'Pfingstmontag' from core.tenants union all
select 'holiday-at-2026-06-04-' || id, id, 'default', '2026-06-04'::date, 'AT', 'Corpus Christi' from core.tenants union all
select 'holiday-at-2026-08-15-' || id, id, 'default', '2026-08-15'::date, 'AT', 'Mariä Himmelfahrt' from core.tenants union all
select 'holiday-at-2026-10-26-' || id, id, 'default', '2026-10-26'::date, 'AT', 'Nationalfeiertag' from core.tenants union all
select 'holiday-at-2026-11-01-' || id, id, 'default', '2026-11-01'::date, 'AT', 'Allerheiligen' from core.tenants union all
select 'holiday-at-2026-12-08-' || id, id, 'default', '2026-12-08'::date, 'AT', 'Mariä Empfängnis' from core.tenants union all
select 'holiday-at-2026-12-25-' || id, id, 'default', '2026-12-25'::date, 'AT', 'Christtag' from core.tenants union all
select 'holiday-at-2026-12-26-' || id, id, 'default', '2026-12-26'::date, 'AT', 'Stefanitag' from core.tenants
on conflict (tenant_id, jurisdiction, date) do nothing;

notify pgrst, 'reload schema';
