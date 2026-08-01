-- Grants for core tables created after the baseline's blanket GRANT.
--
-- `grant ... on all tables in schema core to service_role` only covers tables
-- that exist at the moment it runs, and the baseline runs it ~2000 lines before
-- device_authorizations, sessions, api_tokens and service_credential are
-- created. Those four have therefore never been writable by service_role in any
-- environment — device login fails with
--   "device_authorizations insert: permission denied for table device_authorizations"
-- and `engenty service-token create` fails the same way on service_credential.
--
-- Re-running the blanket grant fixes the existing tables; the default-privileges
-- grant keeps every core table added from here on covered automatically.

grant usage on schema core to service_role;
grant select, insert, update, delete on all tables in schema core to service_role;
grant usage, select on all sequences in schema core to service_role;

alter default privileges in schema core
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema core
  grant usage, select on sequences to service_role;

notify pgrst, 'reload schema';
