-- Billing: pricing rules on the package (docs/internal/manage-app.md §8). Kept on
-- core.packages (synced from the authored catalog) so a package carries its own
-- base + overage rules. jsonb: { base_micros, currency, includedUsers,
-- perExtraUser_micros }. Null until the catalog re-syncs.

alter table core.packages
  add column if not exists pricing jsonb;
