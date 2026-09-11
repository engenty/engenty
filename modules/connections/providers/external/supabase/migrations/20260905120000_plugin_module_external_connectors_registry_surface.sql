-- Registry surface identity + required headers on imported connectors.
--
-- Additive only: existing records keep their stored actions and auth config,
-- and there is no re-import or backfill. The new columns are filled on the
-- next deliberate import or refresh; until then a record reads as "imported
-- from a URL, no registry surface, no required headers", which is exactly what
-- those imports were.

alter table module_external_connectors.imported_connectors
  add column if not exists registry_surface_slug text,
  add column if not exists required_headers jsonb not null default '[]'::jsonb,
  add column if not exists mcp_transport text;

alter table module_external_connectors.imported_connectors
  drop constraint if exists imported_connectors_mcp_transport_check;
alter table module_external_connectors.imported_connectors
  add constraint imported_connectors_mcp_transport_check
  check (mcp_transport is null or mcp_transport in ('streamable-http', 'sse'));

-- One import per registry surface: the slug is stable per domain, so a second
-- import of the same surface would register a duplicate tool set under a
-- different connector id. Manual URL imports carry no slug and are exempt.
create unique index if not exists imported_connectors_domain_surface_key
  on module_external_connectors.imported_connectors (domain, registry_surface_slug)
  where registry_surface_slug is not null;

notify pgrst, 'reload schema';
