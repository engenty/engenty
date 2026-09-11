-- Carry the space through the OAuth round trip (PLAN-spaces.md Phase CN.4,
-- Flow A).
--
-- Connecting an account from inside a space and landing back with it NOT
-- available there is the flow failing at its last step: the user did the work,
-- the account exists, and the space still shows "no accounts". The space has to
-- survive the redirect to the provider and back, and the pending flow row is
-- the only thing that does — the callback is anonymous, the state nonce IS the
-- session.
--
-- Nullable, and no default: a connect started from tenant settings genuinely
-- belongs to no space, and inventing one would auto-mount accounts into
-- whichever space the user last visited.
--
-- No foreign key to core.spaces on purpose. The row is short-lived (TTL, then
-- consumed) and a deleted space must not fail an in-flight connect — the
-- callback checks the mount write and shrugs it off, which is the same
-- direction every other step of this flow fails in.

alter table module_connections.pending_oauth_flows
  add column if not exists space_id uuid;

notify pgrst, 'reload schema';
