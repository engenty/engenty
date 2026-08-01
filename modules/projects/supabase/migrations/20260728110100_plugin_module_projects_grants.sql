-- portal_rate_limits was added after this schema's blanket grant, so it never
-- got service_role privileges (portal rate limiting writes fail with
-- "permission denied for table portal_rate_limits"). Same fix as core: re-run
-- the grant and add default privileges so future tables stay covered.

grant usage on schema module_projects to service_role;
grant select, insert, update, delete on all tables in schema module_projects to service_role;
grant usage, select on all sequences in schema module_projects to service_role;

alter default privileges in schema module_projects
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema module_projects
  grant usage, select on sequences to service_role;

notify pgrst, 'reload schema';
