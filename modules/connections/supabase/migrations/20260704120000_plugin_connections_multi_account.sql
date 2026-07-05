-- Multi-account connections: allow N connections per connector, discriminated
-- by the provider account (`external_account`, resolved at the OAuth callback).
-- Replaces the one-per-(owner|tenant) partial unique indexes.

drop index if exists module_connections.uq_module_connections_personal;
drop index if exists module_connections.uq_module_connections_org;

-- NULLS NOT DISTINCT: a degraded connect (resolveAccount failed →
-- external_account null) can hold at most one row per scope; the upsert
-- treats that null-account row as its replace target on the next connect.
create unique index if not exists uq_module_connections_personal
  on module_connections.connections (tenant_id, connector_id, owner_user_id, external_account)
  nulls not distinct
  where sharing = 'personal';

create unique index if not exists uq_module_connections_org
  on module_connections.connections (tenant_id, connector_id, external_account)
  nulls not distinct
  where sharing = 'org';
