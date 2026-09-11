-- Second standing consent on the person's browser row (PLAN-user-browser.md
-- D3, D11): `autostart` — may an agent START this person's browser in the
-- space without asking first. Off (default): an agent that needs a browser
-- the person never started asks for it in the chat and waits; headless runs
-- stop with `needs_user`. On: the browser is created on the agent's first use.
--
-- Idempotent.

alter table core.space_browser_grants
  add column if not exists autostart boolean not null default false;

comment on column core.space_browser_grants.autostart is
  'Agents may start (create) the user''s browser in this space without asking first.';
