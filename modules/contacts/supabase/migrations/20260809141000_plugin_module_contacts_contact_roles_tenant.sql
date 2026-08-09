-- Give module_contacts.contact_roles a tenant boundary of its own.
--
-- The table was (contact_id, role): the tenant lived only in the parent
-- contact, and the RLS policies joined through to find it. Modules read
-- through a service-role client that BYPASSES RLS, so that join was the only
-- boundary — and one reader does not perform it. `listContactIdsByRole`
-- (modules/contacts/src/dal/supabase.ts) selects contact_id filtered on `role`
-- and nothing else, so it scans every tenant's roles.
--
-- Not exploitable today: the ids it returns are fed straight into a
-- tenant-filtered `.in("id", ids)` read on contacts, which drops the foreign
-- ones. That is the same correct-by-accident shape that produced the secrets
-- reveal leak, and it breaks the moment those ids are used for anything else.
--
-- Composite FK as in the project_team / task_collaborators changes: it makes a
-- role row that disagrees with its own contact unrepresentable, so the
-- denormalised columns are a boundary rather than a second source of truth.

-- 0. Drop the composite FK first if a previous run created it — it depends on
--    the parent unique index recreated in step 1. Only matters on a re-run.
alter table module_contacts.contact_roles
  drop constraint if exists contact_roles_contact_tenant_fkey;

-- 1. The parent key the composite FK references.
alter table module_contacts.contacts
  drop constraint if exists contacts_id_tenant_scope_key;

alter table module_contacts.contacts
  add constraint contacts_id_tenant_scope_key unique (id, tenant_id, scope_id);

-- 2. Add nullable, backfill from the parent, then enforce.
alter table module_contacts.contact_roles
  add column if not exists tenant_id uuid,
  add column if not exists scope_id text;

update module_contacts.contact_roles cr
set tenant_id = c.tenant_id,
    scope_id = c.scope_id
from module_contacts.contacts c
where c.id = cr.contact_id
  and (cr.tenant_id is null or cr.scope_id is null);

-- contact_id already had an ON DELETE CASCADE foreign key, so an orphan role
-- row cannot exist and the backfill must have covered everything. Fail loudly
-- rather than silently dropping roles that classify contacts.
do $$
declare
  unresolved int;
begin
  select count(*) into unresolved
  from module_contacts.contact_roles
  where tenant_id is null or scope_id is null;

  if unresolved > 0 then
    raise exception
      'contact_roles backfill left % row(s) with no tenant/scope', unresolved;
  end if;
end $$;

alter table module_contacts.contact_roles
  alter column tenant_id set not null,
  alter column scope_id set not null;

-- 3. Swap the single-column FK for the composite one.
alter table module_contacts.contact_roles
  drop constraint if exists contact_roles_contact_id_fkey;

alter table module_contacts.contact_roles
  add constraint contact_roles_contact_tenant_fkey
    foreign key (contact_id, tenant_id, scope_id)
    references module_contacts.contacts (id, tenant_id, scope_id)
    on delete cascade
    on update cascade;

-- Replaces idx_..._contact_roles_role for the by-role lookup, which is now
-- always tenant-qualified. The old role-only indexes stay: the RLS-side
-- search functions still filter on role alone within an already-scoped join.
create index if not exists idx_module_contacts_contact_roles_tenant_role
  on module_contacts.contact_roles (tenant_id, scope_id, role);

-- 4. Direct predicates instead of exists-subqueries through contacts.
drop policy if exists contact_roles_read_own_scope on module_contacts.contact_roles;
create policy contact_roles_read_own_scope on module_contacts.contact_roles
for select using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

drop policy if exists contact_roles_insert_own_scope on module_contacts.contact_roles;
create policy contact_roles_insert_own_scope on module_contacts.contact_roles
for insert with check (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

drop policy if exists contact_roles_delete_own_scope on module_contacts.contact_roles;
create policy contact_roles_delete_own_scope on module_contacts.contact_roles
for delete using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);
