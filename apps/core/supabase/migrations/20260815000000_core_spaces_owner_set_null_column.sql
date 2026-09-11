-- Deleting a user aborted tenant-wide: the owner FK on core.spaces
-- (20260811000000) used the bare composite form `on delete set null`, which
-- nulls EVERY referencing column — tenant_id included — and tenant_id is
-- not null. Every user owns a personal space (core.ensure_personal_space),
-- so any `delete from core.users` hit it. Same trap 20260810070200 fixed on
-- module_kb.knowledge_bases; this is the column-targeted PG15+ form that
-- nulls only the owner. The orphan trigger (orphan_personal_space_on_leave)
-- still owns the semantic side — this constraint merely stops taking
-- tenant_id down with the owner.

alter table core.spaces
  drop constraint if exists spaces_owner_user_tenant_fkey;

alter table core.spaces
  add constraint spaces_owner_user_tenant_fkey
  foreign key (owner_user_id, tenant_id) references core.users (id, tenant_id)
  on delete set null (owner_user_id);

notify pgrst, 'reload schema';
