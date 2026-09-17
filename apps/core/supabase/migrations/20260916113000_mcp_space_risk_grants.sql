-- MCP clients are delegated interfaces over the same Space security model.
-- Existing module/read-write grants cannot be translated safely to a risk
-- ceiling, so force re-consent rather than guessing at the person's intent.

alter table core.mcp_client_grants
  add column if not exists max_risk_level text not null default 'medium';

alter table core.mcp_client_grants
  drop constraint if exists mcp_client_grants_max_risk_level_check;

alter table core.mcp_client_grants
  add constraint mcp_client_grants_max_risk_level_check
  check (max_risk_level = any (array['low', 'medium', 'high', 'critical']));

update core.mcp_client_grants
   set revoked_at = coalesce(revoked_at, now())
 where revoked_at is null;

comment on table core.mcp_client_grants is
  'OAuth MCP grants: acting user + client bound to a non-empty Space allow-list and operation-risk ceiling.';

comment on column core.mcp_client_grants.max_risk_level is
  'Hard risk ceiling checked before approval; approval can never widen it.';
