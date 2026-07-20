# Local test plan — agent-gated secret reveals (gate + durable goal grants)

Feature branch: `feat/secrets-vault`. Tests the wiring from
`docs/wip/secrets-vault-module.md` + the agent-connect work: identity
forwarding (`x-engenty-agent-id`/`x-engenty-goal-id`), `createSecretsRevealPolicy`
firing for agents, in-chat HITL approval, durable `core.agent_goal_grants`
persistence, ceiling enforcement, and audit attribution.

Preconditions (verified 2026-07-19): `engenty-secrets` Supabase stack up with
2 tenants / 3 users / 9 secrets; `AI_GATEWAY_API_KEY` set; supabase CLI 2.108.

## Phase 0 — Prep (~5 min)

1. **Free memory: stop the duplicate stack** (the OOM cause — reversible):
   `supabase stop --project-id engenty-local`
   Keep `engenty-secrets` running.
2. **Apply the new migration** (idempotent; no reset, data survives):
   `supabase migration up` from the repo root (or apply
   `supabase/migrations/20260719120000_ai_agent_core_link.sql` via psql).
   Verify:
   ```sql
   select column_name from information_schema.columns
     where table_schema='ai' and table_name='engenty_ai_agents'
     and column_name='core_agent_id';           -- 1 row
   select indexname from pg_indexes
     where schemaname='core' and indexname='agents_tenant_name_key'; -- 1 row
   ```
3. **Start dev servers**: launch config `dev-portless`
   (`pnpm dev:portless --domain=secrets`, UI on :5183).
4. **Sign in** via the established no-password-typing pattern: mint the GoTrue
   session through the auth API and inject it into localStorage.
5. Keep a psql window open:
   `docker exec -it supabase_db_engenty-secrets psql -U postgres`

## Phase 1 — Regression: human path unchanged

- In the vault UI (`/mdl/secrets`): reveal a secret → plaintext shows, **no**
  approval card.
- ```sql
  select principal_kind, action, goal_id from module_secrets.access_log
    order by created_at desc limit 1;  -- user | reveal | null
  ```
- While here, verify the new UI: dock app icon opens the vault; client /
  project / scope filters compose (project list narrows to selected client);
  Clear resets all.

## Phase 2 — Identity provisioning

- Open a **fresh copilot chat**, send any message.
- ```sql
  select id, name, status from core.agents;  -- 1 row: engenty.copilot / active
  ```
- Send a second message / start a second chat → still exactly one row
  (idempotent; unique on tenant+name).
- Watch server logs for `resolveCoreAgentId failed` (must not appear).

## Phase 3 — Gate fires (core scenario)

- In the fresh chat: *"Reveal the password of the secret named `<name>`"*.
- **Expect**: the copilot discovers and calls `secrets_reveal`, the run
  suspends, and an **Approve once / Approve always / Deny** card renders.
  No plaintext anywhere before a decision.
- Choose **Deny** → the agent reports the denial; verify **no** new
  `access_log` decrypt row and `core.agent_goal_grants` is still empty.

## Phase 4 — Durable grant

1. Ask again → card → **Approve once**. Expect the reveal to complete
   (plaintext in chat).
2. ```sql
   select goal_id, agent_id, capability, granted_by from core.agent_goal_grants;
   -- goal_id = the conversation's thread uuid, agent_id = null,
   -- capability = secrets.read:<secret uuid>, granted_by = your user
   select principal_kind, action, principal_id, goal_id
     from module_secrets.access_log order by created_at desc limit 1;
   -- agent | decrypt_for_agent | <core.agents uuid> | <thread uuid>
   ```
3. **Same conversation**, reveal the **same** secret again → **no re-prompt**
   (policy allows via the goal grant).
4. **Same conversation**, reveal a **different** secret → **re-prompts**
   (grants are per-secret, no wildcards).
5. **New conversation**, same secret → **re-prompts** (new thread = new goal).

## Phase 5 — Ceiling (approver can't exceed own access)

- Sign in as a user who **cannot** read secret X (e.g. another user's personal
  secret). Ask the copilot to reveal X, approve the card.
- **Expect**: the goal-grant endpoint rejects (403 in server logs), **no**
  `agent_goal_grants` row appears, and the reveal stays blocked (core
  re-gates; the agent reports it needs approval/permission).
- Direct check without the model:
  `curl -X POST $CORE/api/secrets/<X>/goal-grants -H "Authorization: Bearer <userB>" -H 'Content-Type: application/json' -d '{"goal_id":"<any-uuid>"}'` → 403.

## Phase 6 — API-level negatives (curl, no model needed)

Also serves as the fallback harness if chat tool-selection is flaky:

1. **Gate**: invoke as agent →
   `curl -X POST $CORE/api/tools/secrets_reveal/invoke -H "Authorization: Bearer <user>" -H "x-engenty-agent-id: <core.agents uuid>" -H "x-engenty-goal-id: <uuid G>" -d '{"secret_id":"<S>"}'`
   → **202 approval_required** (not plaintext).
2. **Grant**: `POST /api/secrets/<S>/goal-grants` with the user token,
   `{"goal_id":"<G>"}` → 200.
3. **Re-invoke** step 1 → **200 + plaintext**; audit row = agent/decrypt_for_agent/G.
4. **Wrong goal**: re-invoke with goal `G2 ≠ G` → 202 again.
5. **Bad goal_id** (`"not-a-uuid"`) to goal-grants → 400.
6. **Without agent header** (plain user) → 200 plaintext, audited as
   user/reveal — the abstain path.

## Phase 7 — Cleanup / repeatability

- `delete from core.agent_goal_grants;` between grant scenarios.
- New chat = new goal; no other reset needed.
- Restart the other stack later if wanted: `supabase start` in the other checkout.

## Deferred (not blocking)

- Voice path parity (needs a realtime session; same grant-before-execute logic).
- Headless task-job `defer` path (separate approval mechanism, out of scope).
