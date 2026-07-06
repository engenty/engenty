-- Allow the `browser` auth kind (File System Access and other browser-bridged
-- connectors that hold no server-side secret) alongside oauth2 and api_key.
-- The inline column check from the base migration is auto-named
-- `connections_auth_kind_check`.

alter table module_connections.connections
  drop constraint if exists connections_auth_kind_check;

alter table module_connections.connections
  add constraint connections_auth_kind_check
  check (auth_kind in ('oauth2', 'api_key', 'browser'));
