# Secrets Vault — executable test plan

Run against the **dedicated `engenty-secrets` stack** in this worktree. Each case lists
how to drive it, the expected result, and the pass bar. Security-critical cases are
marked 🔒 — a failure there is a release blocker.

## 0. Environment / preconditions

| Thing | Value |
|---|---|
| UI (Vite) | http://localhost:5183 |
| Core API | http://127.0.0.1:8797 |
| AI plane | http://127.0.0.1:8800 |
| HTTPS domain | https://secrets.engenty.localhost (only after `pnpm portless` — sudo, in Terminal) |
| Isolated DB | `postgresql://postgres:postgres@127.0.0.1:54422/postgres` (alias `$DB` below) |
| Seeded | dev admin `admin@dev.local` / `devdevdev`; 1 user-owned secret "Acme DB login" |

Browser auth (no credential form): sign in via GoTrue → inject session into
`localStorage['sb-127-auth-token']` → reload. (Script from the last session; re-mint the
token if expired.)

### Seed the fixtures the scope-matrix needs (run once)
```sql
-- $DB. A 2nd user, a client (org contact), two projects for that client, team rows.
-- Tenant + admin already exist; capture them:
--   select id from core.tenants limit 1;          -> :TENANT
--   select id from core.users where email='admin@dev.local'; -> :ADMIN
insert into core.users(id,tenant_id,email) values (gen_random_uuid(),:'TENANT','bob@dev.local') returning id; -- :BOB
insert into core.user_tenant_roles(user_id,tenant_id,role) values (:'BOB',:'TENANT','member');
insert into module_contacts.contacts(id,tenant_id,scope_id,type,display_name)
  values ('client-acme',:'TENANT','default','organisation','Acme GmbH');
insert into module_projects.projects(id,tenant_id,scope_id,title,client_id)
  values ('proj-q3',:'TENANT','default','Q3 Support','client-acme'),
         ('proj-q4',:'TENANT','default','Q4 Support','client-acme');
insert into module_projects.project_team(project_id,user_id) values ('proj-q3',:'ADMIN'); -- admin on Q3 only
```
(For BOB's browser session, dev-login or GoTrue-sign-in as `bob@dev.local` after setting a password via the admin API.)

---

## A. Happy path (smoke)
1. UI → **Secrets** → fill form → **Create secret** → list shows the row. **Reveal** → payload shown.
   - **Pass:** create returns 200, row appears, reveal shows `{"username":...,"password":...}`.

## B. 🔒 Encryption at rest
2. `$DB`: `select payload_enc from module_secrets.secrets where name='Acme DB login';`
   - **Pass:** value is `iv.ct.tag` base64, **contains neither the username nor the password plaintext**.
   ```sql
   select case when payload_enc ~ 'alice|hunter2' then 'FAIL-LEAK' else 'PASS' end
     from module_secrets.secrets where name='Acme DB login';
   ```

## C. 🔒 Column-grant / RLS isolation
3. As the `authenticated` DB role, `payload_enc` must be unreadable:
   ```sql
   set role authenticated; select payload_enc from module_secrets.secrets limit 1;  -- expect: permission denied
   ```
4. `data_keys.wrapped_dek` unreadable by `authenticated` (same pattern). **Pass:** both denied.
5. Metadata columns ARE selectable (with tenant+scope jwt) — list works in UI. **Pass:** row visible.

## D. 🔒 Audit trail
6. After each reveal: `select action,principal_kind,principal_id,created_at from module_secrets.access_log order by created_at desc limit 5;`
   - **Pass:** one `reveal · user · <admin>` row per reveal; agent reveals log `decrypt_for_agent`.

## E. Owner-scope resolve matrix (the access model)
Create one secret per scope (via UI/API, varying `owner_scope`/`owner_id`), then reveal as different principals.

| # | owner_scope | owner_id | Reveal as | Expect |
|---|---|---|---|---|
| 7 | user | admin | admin | ✅ allow |
| 8 🔒 | user | admin | **bob** | ⛔ 403 forbidden |
| 9 | tenant | tenant-id | bob (in tenant) | ✅ allow |
| 10 | client | `client-acme` | admin (on proj-q3 → client) | ✅ allow |
| 11 🔒 | client | `client-acme` | bob (on no project for client) | ⛔ 403 |
| 12 | project | `proj-q3` | admin (member) | ✅ allow |
| 13 🔒 | project | `proj-q4` | admin (not a member) | ⛔ 403 |
   - **Pass:** every row matches; the 🔒 denials return 403 and write **no** successful `access_log` reveal.

## F. 🔒 Cross-tenant isolation
14. Seed a 2nd tenant + user + secret. Reveal tenant-A's secret id with tenant-B's session.
    - **Pass:** 404/forbidden; `secrets_list` for B never returns A's rows; RLS `current_tenant_id()` blocks it.

## G. 🔒 AAD anti-swap (integrity)
15. `$DB`: swap `payload_enc` between two secrets with different `id`/owner, then Reveal each in UI.
    - **Pass:** reveal **fails to decrypt** (GCM tag/AAD mismatch) → UI shows an error, not a foreign payload.

## H. Update / move
16. Update a secret's payload (UI/`secrets_update`) → Reveal shows the new value; old ciphertext replaced.
17. 🔒 Move a secret to a new owner (`secrets_move`) → Reveal still works (re-encrypted to new AAD); the
    pre-move `payload_enc` no longer decrypts under the new AAD. **Pass:** reveal ok post-move, audit intact.

## I. Agent gate (policy)
18. Invoke `secrets_reveal` as an **agent** principal (agent session / service token with `agentId`) for a
    secret it has no grant to → **require_approval / deny** (createSecretsRevealPolicy).
19. Insert a goal grant `secrets.read:<id>` in `core.agent_goal_grants` for `(goal,agent)` → re-invoke → **allow**;
    log shows `decrypt_for_agent`. Remove/expire the grant → deny again.
    - **Pass:** agent never reveals without an explicit or goal grant; scope membership alone does NOT grant an agent.

## J. Delete
20. Delete a secret (UI/`secrets_delete`) → disappears from list; `$DB` row has `deleted_at` set (soft delete).
    - **Pass:** not listed, not revealable (404), row retained with `deleted_at`.

---

## Results (executed against the live `engenty-secrets` stack, HTTPS proxy up)

| Case | Result |
|---|---|
| A happy path (create→reveal) | ✅ PASS |
| B 🔒 encryption at rest (no plaintext in `payload_enc`) | ✅ PASS |
| C 🔒 column-grant (`authenticated` denied `payload_enc` + `wrapped_dek`) | ✅ PASS |
| D 🔒 audit (reveals logged to `access_log`) | ✅ PASS (8 logged) |
| E7 user→owner | ✅ | E8 🔒 user→other user | ✅ 403 |
| E9 tenant→in-tenant | ✅ | E10 client→member-via-project | ✅ |
| E11 🔒 client→non-member | ✅ 403 | E12 project→member | ✅ |
| E13 🔒 project→non-member | ✅ 403 | | |
| F 🔒 cross-tenant **reveal** (carol→tenant-A secret) | ✅ PASS (404) |
| **F 🔒 cross-tenant LIST (`secrets_list`)** | ✅ PASS after BUG-1 fix (carol→0 rows; admin still sees own tenant) |
| G 🔒 AAD anti-swap (swap ciphertext → decrypt fails; restore → ok) | ✅ PASS (500 / 200) |
| H move (re-home owner, re-encrypt to new AAD, still revealable) | ✅ PASS |
| J delete (soft-delete → 404 + `deleted_at` set) | ✅ PASS |
| I agent gate | ⏸ DEFERRED — needs an agent-runtime principal token; agent authz logic is covered by `resolve.test.ts` (no scope fallthrough) + `createSecretsRevealPolicy` wiring, but a live agent-reveal E2E requires an AI-plane agent run. |

### 🐞 BUG-1 (🔒 cross-tenant metadata leak) — `secrets_list` — ✅ FIXED
`carol@t2` (tenant B) called `secrets_list` and got back **7 rows belonging to tenant A**
(names `userOwned`, `clientOwned`, …). The handler queries with the **service-role client
(bypasses RLS) and has no `tenant_id` filter**. Ciphertext is NOT exposed (only metadata:
name/kind/owner), and `reveal` is still tenant-safe (404) — but names/existence leak across
tenants. **Reveal path is unaffected; only `secrets_list` is vulnerable.**

Fix (one line, `modules/secrets/src/api/operations.ts`, `secrets_list` handler):
```ts
let q = db().from("secrets")
  .select("…")
  .eq("tenant_id", ctx.auth.tenantId)   // <-- ADD: RLS is bypassed by service-role
  .is("deleted_at", null);
```
The `/list` and `/fetch`-style sibling ops (if added) need the same guard — audit every
service-role read for a tenant filter.

## Exit criteria
All 🔒 cases pass (B, C, D, E-8/11/13, F, G, H-17, I). Non-🔒 failures are bugs to file, not
necessarily blockers. Record results inline and file any deviation against the plan's §9 roadblocks.
