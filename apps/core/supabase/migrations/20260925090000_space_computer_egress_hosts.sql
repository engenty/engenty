-- Hosts a Space's computer may reach beyond the shared registry allowlist
-- (deploy/egress-proxy/filter): the APIs of the CLIs its agents install. The
-- egress proxy enforces them per Space; `none` reach ignores them.
ALTER TABLE core.spaces
  ADD COLUMN computer_egress_hosts text[] NOT NULL DEFAULT '{}';

ALTER TABLE core.spaces
  ADD CONSTRAINT spaces_computer_egress_hosts_size_check
  CHECK (cardinality(computer_egress_hosts) <= 100);

COMMENT ON COLUMN core.spaces.computer_egress_hosts IS 'Extra hosts this space''s computer may reach through the egress proxy: an exact host (api.example.com) or every subdomain (*.example.com). Added to the shared allowlist.';
