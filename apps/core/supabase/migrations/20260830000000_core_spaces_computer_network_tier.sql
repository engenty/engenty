-- How far this space's shared computer may reach off the machine. Null
-- inherits the host default (ENGENTY_SPACE_COMPUTER_NETWORK_TIER). The tier
-- sits on the space rather than on an agent because the machine is one per
-- space and its HostConfig is fixed by whoever starts it first.

alter table core.spaces
  add column if not exists computer_network_tier text;

alter table core.spaces
  drop constraint if exists spaces_computer_network_tier_check;

alter table core.spaces
  add constraint spaces_computer_network_tier_check
  check (
    computer_network_tier is null
    or computer_network_tier in ('none', 'egress')
  );

comment on column core.spaces.computer_network_tier is
  'Network reach of this space''s shared computer: none (no network) or egress (through the host allowlist proxy). Null inherits the host default.';
