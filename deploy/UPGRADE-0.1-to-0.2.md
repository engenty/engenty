# Upgrading an existing install from 0.1.x to 0.2.0

0.2.0 is not a normal release. It adds 107 migrations, three Docker networks,
two proxies, a directory on the host, and it deletes data on purpose. A
deploy that only pulls new images will come up wrong — quietly, in the ways
this document names.

Read it through before starting. The steps are ordered: §0b rehearses the whole
thing against a copy, §1 and §2 happen **before** the deploy, §3–§6 change how
the stack is configured, §7 deploys, §8 proves it worked.

Applies to a stack running v0.1.x in either layout — the combined
`docker-compose.prebuilt.yaml` or the blue-green pair in
[BLUE-GREEN.md](./BLUE-GREEN.md). Where they differ, both are given.

---

## 0. Back up first — some of this is not recoverable

Take a database backup you have actually restored from before, not a snapshot
you assume works. Also back up the spaces tree if the old host has one
(`bash deploy/scripts/backup-spaces.sh`) and the app-host store.

**0.2.0 deletes the following by declared policy.** These are deliberate
cutovers, written into the migrations, not accidents — but they are permanent,
and no migration converts the old rows:

| Deleted | Migration | What it was |
|---|---|---|
| every row in `ai.routines`, `ai.flow_graph`, `ai.flow_graph_version`, `ai.action_request` | `20260829220000_ai_flow_graph_owner_title` | tenant-authored flows and routines. Module-owned workflows re-reconcile on boot; anything a user built does not come back. The truncate runs mid-chain: by the end `ai.flow_graph` has been renamed to `ai.workflow`, so do not look for it afterwards. |
| `module_tasks.goals` (and `tasks.goal_id`) | `20260903121000_plugin_tasks_drop_goals` | Goals left the tasks module |
| `module_tasks.triggers`, `module_tasks.task_templates`, `module_tasks.tenant_settings` | `20260823130000`, `20260825190000`, `20260825161000` | superseded by routines and core tenant settings |
| `module_apps.app_consent`, and every row in `module_apps.app_versions` | `20260909150000_plugin_module_apps_git_source` | consent records, and the stored App releases. Each App redeploys from its git source; until it does, it is offline. |
| three `module_kb.kb_settings` keys (`kb.default_kb_id`, `kb.auto_generate_summary`, `kb.auto_generate_questions`), and `knowledge_bases.is_default` | `20260905200000_plugin_module_kb_settings_spaces` | superseded by one KB per space. Only those three keys — every other setting row stays. |

If any of those rows matter, export them before you start. There is no
supported downgrade: the migrations are forward-only, and restoring the backup
is the only way back.

How much that is depends entirely on the install. Measured on
`engenty.engrd.xyz` (2026-09-11, at v0.1.137): **18 rows in total** — 7
`kb_settings` of which 3 go, 4 task triggers, 4 task templates, 2 tasks tenant
settings, 1 goal. The `ai.routines` / `ai.flow_graph` tables that the first row
of the table above warns about **did not exist yet** on that install: 0.2.0
creates them and truncates them empty, so the loudest warning here cost that
deployment nothing. §0b is how you find your own number instead of assuming
either way.

**Also reset, but rebuildable.** These the app regenerates on its own, or the
data was per-viewer state with a replacement. Listed so nothing on the list
above looks like the whole of it:

| Reset | Migration | Recovery |
|---|---|---|
| KB rows in `search.documents` with no space | `20260815010000_plugin_retrieval_space_reset` | Rebuild the search index (§8), or wait for each article's next edit. Until then those articles are absent from search — the migration chose that over answering from the wrong space. |
| `core.notifications.seen_at` | `20260907230000_core_notifications_first_to_answer` | Per-viewer seen state, replaced by `core.notification_seen`. Old notifications reappear as unseen once. |
| baseline `core.space_mount` rows for memory and coordinator | `20260903120000`, `20260903140000` | Those modules left the space baseline; mounts are re-created on demand. |
| `core.space_member` rows on personal spaces | `20260811020000_core_personal_space_has_no_members` | A personal space has no roster by definition. |
| `ai.artifact_storage_binding` rows scoped to a goal | `20260903121100_ai_artifact_drop_goal_scope` | Goals left the model with `module_tasks.goals` above. |
| `core.approval_grants` scoped to a trigger | `20260825190000_plugin_tasks_drop_triggers` | Re-granted the next time the routine asks. |
| duplicate `module_tasks.task_runs` rows | `20260817140000_plugin_tasks_one_run_row_per_run` | History dedupe — one row per run now. |

Five migrations that existed in 0.1.x are gone from the tree (two
`engenty_coordinator`, one `kb_filesystem_sync`, two `module_memory`). Their
rows stay in `supabase_migrations.schema_migrations` and the `module_memory`
schema stays in the database. Both are harmless — `supabase db push
--include-all` does not care about ledger rows whose files no longer exist,
and an unused schema costs nothing. Leave them.

---

## 0b. Rehearse it against a copy first

Worth an hour: copy production's data into a throwaway database at the version
you are on, run the chain against it, and count what changed. It turns every
warning above into a number for *your* install, and it is how the corrections
in this document were found.

A worktree keeps it away from your dev stack. Give it its own Supabase — a
unique `project_id` and a port block off the shared 54321/54821 range — so
nothing else on the machine notices:

```bash
git worktree add --detach ../engenty-upgrade-test v0.1.137
cd ../engenty-upgrade-test && pnpm install
pnpm engenty generate                    # writes supabase/config.toml
#   edit it: project_id = "engenty-upgrade", ports 55321/55322/...
pnpm exec supabase start                 # applies the 0.1.x chain — a schema identical to production
```

Two things bite when moving the data, both worth knowing before you hit them:

- **`pg_dump` must be at least the server's version**, and since 17.6 it writes
  a `\restrict` line that breaks `\.` COPY terminators when the dump is piped
  through `psql`. Use the custom format and `pg_restore`. The Supabase container
  you just started has a matching `pg_dump`, so you need not install one.
- **`--disable-triggers` fails**: Supabase's `postgres` role may not disable FK
  system triggers. `SET session_replication_role = replica` does the same job
  and is allowed.

```bash
# Dump (read-only). Supabase Cloud's direct host is IPv6-only — use the
# session pooler on port 5432 if your network has no IPv6 route.
docker exec -i -e PGPASSWORD="$PROD_DB_PASSWORD" supabase_db_engenty-upgrade pg_dump \
  "postgresql://postgres.<ref>@aws-0-<region>.pooler.supabase.com:5432/postgres" \
  -Fc --data-only --no-owner --exclude-table='ai.mastra_*' \
  --schema=core --schema=ai --schema=search --schema=context_graph \
  $(printf -- '--schema=%s ' $(…every module_* schema…)) > prod.dump

# Restore
docker cp prod.dump supabase_db_engenty-upgrade:/tmp/prod.dump
docker exec -i supabase_db_engenty-upgrade sh -c \
  '{ echo "SET session_replication_role = replica;"; \
     pg_restore --data-only --no-owner -f - /tmp/prod.dump; } \
   | psql -U postgres -d postgres -v ON_ERROR_STOP=0'
```

Mastra's own tables are excluded on purpose: it creates them on boot, and the
one migration that touches them is guarded with `to_regclass`, so their absence
is a clean no-op. Duplicate-key errors on the model catalog are the local seed
meeting the same rows from production — harmless.

**Restore the migration ledger too, or the rehearsal cannot see the one failure
that stops the real deploy.** The dump above names data schemas only, so the
copy starts with an empty `supabase_migrations.schema_migrations` and
`db push --include-all` happily applies all 253 migrations from scratch.
Production's ledger is not empty: it carries rows for migrations whose files no
longer exist in 0.2.0 — the retired `memory` and `engenty-coordinator` modules —
and `supabase db push` refuses to run at all while they are there:

```
Remote migration versions not found in local migrations directory.
supabase migration repair --status reverted 20260616000700 20260721000000 \
  20260722000000 20260804120000
```

Add the ledger to the dump to reproduce it:

```bash
--schema=supabase_migrations
```

Then run the repair the CLI prints, on the copy first and on production during
§7. It rewrites four rows in the tracking table and touches no schema and no
data; `--status applied` puts them back. The retired modules' own objects are
dropped by 0.2.0's migrations, so nothing is left expecting them.

Then count what you are about to lose, switch the worktree to the release, and
count again:

```bash
git checkout --detach origin/main          # or the release tag
pnpm install && pnpm engenty generate
pnpm engenty db migrate
pnpm exec supabase stop && pnpm exec supabase start   # PostgREST picks up the new schemas
pnpm engenty doctor --url http://127.0.0.1:55321 --anon-key … --service-key …
```

Counting query, before and after — `to_regclass` keeps it quiet about tables
that do not exist on one side or the other:

```sql
select t.tbl,
  case when to_regclass(t.tbl) is null then 'absent'
  else (xpath('/row/c/text()', query_to_xml(
        format('select count(*) c from %s', t.tbl), false, true, '')))[1]::text
  end as rows
from (values ('ai.routines'),('ai.action_request'),('module_tasks.goals'),
             ('module_tasks.triggers'),('module_tasks.task_templates'),
             ('module_tasks.tenant_settings'),('module_kb.kb_settings'),
             ('module_apps.app_consent'),('module_apps.app_versions'),
             ('core.tenants'),('core.users'),('search.documents')) as t(tbl)
order by 1;
```

Expect a small difference in row counts between the pre-dump count and the
restored copy: production keeps writing while you dump.

---

## 1. Fix the exposed schemas (before the deploy)

Exposed schemas are Supabase **project configuration**, so no migration can
touch them — and 0.2.0 changes the list in both directions:

- **Added:** `module_banking` and `module_expenses`. 0.2.0 enables the banking
  and expenses modules, whose migrations create those schemas.
- **Removed:** `module_memory`. 0.2.0 retires the Memory module and its
  migrations **drop** that schema.

The removal is the one that bites. A schema in the list that does not exist
does **not** fail quietly and it is **not** a no-op — PostgREST refuses to build
its schema cache at all:

```
Failed to load the schema cache using db-schemas=…,module_memory,…
{"code":"3F000","message":"schema \"module_memory\" does not exist"}
Attempting to reconnect to the database in 4 seconds…
```

Every request then answers `PGRST002 Could not query the database for the schema
cache. Retrying.`, `engenty-edge` refuses to start on its server-lane preflight,
and the whole site serves 503. The list is configuration, not state, so this
survives restarting PostgREST and restarting the project — it clears only when
the stale entry is removed.

Print the list this release needs, from a 0.2.0 checkout:

```bash
node scripts/supabase-schemas.mjs
```

**Replace the whole field with that list.** Do not append to what is there —
appending leaves `module_memory` in place, which is exactly the failure above.

- **Supabase Cloud:** Settings → API → Exposed schemas, or let the deploy
  wizard do it (`pnpm engenty deploy`, Supabase step).
- **Self-hosted:** `PGRST_DB_SCHEMAS` on the rest/postgrest service, then
  restart it.

### Doing it before the deploy, with no window

The list names two schemas the migrations have not created yet, so saving it
first would break PostgREST for the same reason — unless you create them
empty. Both module migrations are `create schema if not exists`, so this is
compatible with what runs later:

```bash
psql "$SUPABASE_DB_URL" -c 'create schema if not exists module_banking;
                            create schema if not exists module_expenses;'
```

Then save the new list. Dropping `module_memory` from it while 0.1.x is still
running takes the Memory module's API offline for the minutes until you deploy;
that module is being retired by this upgrade, so accept it rather than trying
to sequence around it.

**It has to be a restart, not a reload.** The list reaches PostgREST as process
configuration, so `NOTIFY pgrst, 'reload schema'` will not do it. The Supabase
dashboard restarts it for you when you save; a self-hosted stack needs the rest
service recreated.

### If you discover this mid-deploy

The site is already down and the migrations have run, so:

1. Get `engenty-migrate` to exit 0. The database work is independent of
   PostgREST and completes fine once the ledger is repaired (§7) — check that
   first, because the two failures look alike from the outside: both leave the
   site at 503 with no containers serving.
2. Replace the exposed-schema list and save.
3. Confirm PostgREST is serving before redeploying — one request answers the
   whole question, because a bogus profile makes it enumerate the list:

   ```bash
   curl -s -H "apikey: $SUPABASE_ANON_KEY" -H "Accept-Profile: __nope__" \
     "$SUPABASE_URL/rest/v1/whatever"
   ```

   `PGRST106` with the schemas listed in the hint means it is healthy.
   `PGRST002` means it is still looping.
4. Redeploy, so `engenty-edge` and `engenty-ai` start against a working API.

Confirm:

```bash
set -a; . deploy/.env; set +a
pnpm engenty doctor
```

It will report the schemas as served and — until §7 has run — that migrations
are behind. That is the expected state at this point.

The access-token hook is unchanged from 0.1.x. `doctor` checks it anyway; if it
reports the hook missing, fix that first, because it has been broken for a
while.

---

## 2. Prepare the host

### The spaces tree (new in 0.2.0)

Every App's source and data, and each space's files, live at
`/opt/engenty/spaces`. Both `engenty-ai` and `engenty-app-host` bind it, and
both run as uid 1000. If Docker creates the directory, it is owned by root and
app-host cannot write to it.

```bash
install -d -m 700 -o 1000 -g 1000 /opt/engenty/spaces
```

This is tenant data with no other copy. Add it to your backups.

### The proxy config files (new in 0.2.0)

`engenty-egress-proxy` and `engenty-browser-proxy` bind four files from the
application directory, beside the compose file:

```
browser-proxy/tinyproxy.conf   browser-proxy/filter
egress-proxy/tinyproxy.conf    egress-proxy/filter
```

Nothing delivers them. If your deployment gets its compose from the control
panel rather than a git checkout — Coolify's compose buildpack does — those
paths do not exist on the host, and Docker creates them as **directories** on
first `up`. The container then fails to start with

```
error mounting ".../browser-proxy/tinyproxy.conf" to rootfs at
"/etc/tinyproxy/tinyproxy.conf": not a directory: Are you trying to mount a
directory onto a file (or vice-versa)?
```

and the deploy aborts *after* the old containers are gone. Copy them up first,
from a 0.2.0 checkout:

```bash
APP_DIR=/data/coolify/applications/<app-uuid>   # wherever the compose file lives
ssh root@<host> "rm -rf $APP_DIR/browser-proxy $APP_DIR/egress-proxy"
scp -r deploy/browser-proxy deploy/egress-proxy root@<host>:$APP_DIR/
```

`rm -rf` rather than `rmdir` because a failed deploy leaves the auto-created
directories behind. They are always empty — Docker only ever creates the mount
point — so there is nothing in them to lose.

### The egress network, if one already exists

0.2.0 declares `engenty-egress`, `engenty-browser-egress` and
`engenty-browser-view` as `internal: true`. Compose cannot flip `internal` on a
network that already exists, and it fails after the old containers are gone.

A stack that has only ever run v0.1.x has none of these — nothing to do. Check
rather than assume:

```bash
docker network inspect engenty-egress --format '{{.Name}} internal={{.Internal}}' 2>/dev/null \
  || echo 'absent — nothing to do'
```

If it exists and says `internal=false`, remove it with the stack stopped:

```bash
docker network rm engenty-egress
```

### Blue-green only

[BLUE-GREEN.md § One-time host preparation](./BLUE-GREEN.md) covers the rest —
the `engenty-runtime` network, `/opt/engenty/app-host-data`, and copying the old
named volume into it. Follow it there; it is not repeated here.

---

## 3. The image names changed

Pro images are now `ghcr.io/engenty/engenty-pro-<service>`, because the public
repo publishes `engenty-<service>` from the open tree. The compose files in
this repo already name them; there is no variable to set.

Two consequences:

- The GHCR packages are new paths, created on the first 0.2.0 build. The
  existing `docker login ghcr.io` on the host still covers them — the
  credential is per-registry, not per-package — but the packages must exist
  before the host can pull, so let the release build finish first.
- Anything of your own that pins `ghcr.io/engenty/engenty-edge` (a script, a
  Watchtower config, a second environment) now points at the **public** image,
  which carries none of the closed modules. Update those pins.
- A **pre-pull script is the one that fails quietly**: it keeps pulling the old
  names successfully, so nothing errors, and the real images then download
  inside the deploy's own window — which is the window with no containers
  serving. On this install that turned a recreate into gigabytes of transfer
  mid-outage. Grep your host for `engenty-` image references before deploying.

---

## 4. Turn engenty Apps back on, or it stops

`engenty-app-host` moved behind the `apps` compose profile. On a 0.1.x host it
ran unconditionally, so after the upgrade it simply will not start unless the
profile is enabled.

Set on the application (Coolify) or the compose invocation:

```
COMPOSE_PROFILES=apps
```

Add `docs` and `studio` to that same comma-separated list if you had them
(`COMPOSE_PROFILES=apps,docs`). `ENGENTY_APP_HOST_TOKEN` was already required
in 0.1.x, so it is already set — leave it alone.

To take Apps out of service deliberately, leave `apps` out; nothing else
depends on it.

---

## 5. One more image to pull

0.2.0 gives each person a browser per space, launched from its own image. Like
the sandbox image, it arrives as a pull-only stand-in service — `up` pulls it
onto the host daemon so `engenty-ai` can start sibling containers from it.

Nothing to do beyond the deploy itself, but two things to know:

- The pull happens with everything else, so the first 0.2.0 deploy fetches one
  more image than you may expect.
- `ENGENTY_BROWSER_DOCKER_IMAGE` is set by the compose files to the fully
  qualified name. If you override it, keep it fully qualified — `engenty-ai`
  hands the string to the host daemon, which resolves a bare name against
  Docker Hub and fails.

---

## 6. Environment additions

Nothing new is *required*: every variable 0.2.0 adds has a default. Three are
worth setting deliberately.

| Variable | Why |
|---|---|
| `ENGENTY_REALTIME_TICKET_SECRET` | Signs live-view tickets. Random per process when unset, which only works while exactly one `engenty-ai` is running. Set it if that is ever not true. |
| `ENGENTY_SPACES_DIR` | Already `/opt/engenty/spaces` in the compose files. Only set it if you put the tree somewhere else — and then the bind mount must match. |
| `ENGENTY_SPACE_PURGE_AFTER_DAYS` | How long a soft-deleted space is kept before its rows go. Decide it rather than inherit it. |

`ENGENTY_AI_MEMORY_REFLECTION` is gone; remove it if present. The browser
ceilings (`ENGENTY_BROWSER_MAX_PER_TENANT`, `_PER_USER`,
`ENGENTY_BROWSER_IDLE_STOP_MS`) and the Langfuse/OTLP variables all have
working defaults — see [DEPLOY.md](./DEPLOY.md).

Regenerate your template to see everything at once:

```bash
diff <(git show v0.1.137:deploy/.env.example) deploy/.env.example
```

---

## 7. Deploy

107 migrations run before any container serves traffic, provided
`SUPABASE_DB_URL` is set. Check that it is — without it the migrate step
**skips silently** and the new images meet a 0.1.x schema.

### Repair the migration ledger first

`supabase db push` refuses to run while the tracking table names migrations
whose files 0.2.0 no longer ships — the retired `memory` and
`engenty-coordinator` modules leave four such rows on every 0.1.x install:

```
Remote migration versions not found in local migrations directory.
supabase migration repair --status reverted 20260616000700 20260721000000 \
  20260722000000 20260804120000
```

Run exactly that, against the same `SUPABASE_DB_URL` the deploy uses:

```bash
docker run --rm --entrypoint supabase ghcr.io/engenty/engenty-pro-migrate:latest \
  migration repair --db-url "$SUPABASE_DB_URL" --status reverted \
  20260616000700 20260721000000 20260722000000 20260804120000
```

Four rows in `supabase_migrations.schema_migrations`; no schema, no data.
`--status applied` puts them back. Doing it before the deploy costs nothing —
`engenty-migrate` exits 1 otherwise, and by then the old containers are gone.

### Blue-green

Follow [BLUE-GREEN.md § Release sequence](./BLUE-GREEN.md). The orchestrator
pre-migrates, brings up the inactive color, waits for readiness, promotes, and
drains the old one. Do not shortcut it: the migration contract is what keeps a
half-migrated database from serving.

### Combined

```bash
docker compose -f deploy/docker-compose.prebuilt.yaml --env-file deploy/.env pull
docker compose -f deploy/docker-compose.prebuilt.yaml --env-file deploy/.env up -d
```

`engenty-migrate` runs first; the app services wait on it completing
successfully, so a failed migration fails the deploy instead of producing a
container on a stale schema.

The migrations themselves are quick — rehearsed against a copy of this
install's database, the 106 pending migrations applied in **under 5 seconds**
with no errors. Budget the deploy window for image pulls and container
restarts, not for the schema change.

---

## 8. Verify

```bash
set -a; . deploy/.env; set +a
pnpm engenty doctor
```

Both checks must pass, and the migration count should now be in the 250s.

Then the smoke list from [DEPLOY.md § 5](./DEPLOY.md), plus the things only
0.2.0 has:

- [ ] Sign out and back in — the tenant claim is reissued, not refreshed
- [ ] A space opens, and its Data tab lists folders
- [ ] `docker ps` shows `engenty-egress-proxy` and `engenty-browser-proxy`
- [ ] A sandbox can still install a package: run a command in a space computer
      and confirm `pip install` works, while
      `curl --noproxy '*' https://example.com` from the same machine fails.
      That pair is the only check that proves the sealed networks are wired —
      a proxy that lost its second network membership blackholes every install
      silently.
- [ ] Apps (if `COMPOSE_PROFILES` includes `apps`): an existing App still
      responds. If its store did not survive, redeploy it from its source.
- [ ] A per-user browser starts, and `docker images` lists the browser image
- [ ] Rebuild the search index (superadmin → Settings → Search index). 0.2.0
      deleted the space-blind KB rows; until a rebuild those articles answer
      nothing. A missing row scans as `pending`, so the rebuild picks up
      exactly these.

---

## Rollback

There is no forward-compatible downgrade. The 0.1.x images cannot read the
0.2.0 schema, so rolling back means restoring the database backup from §0 and
redeploying the previous release tag — losing everything written since the
upgrade.

Blue-green narrows the window but does not remove it: the old color can be
promoted back in seconds, but it will be talking to an already-migrated
database. Treat colour rollback as useful only for a failure *before* the
migrate step completes.

---

## Afterwards

Once 0.2.0 is running and you are not going back, the migration history is a
candidate for consolidation: 253 files, most of them describing states no
install will ever pass through again. Squash per module rather than globally —
aggregation is per-plugin, so a single baseline breaks enabling and disabling
modules — and seed this install's `supabase_migrations.schema_migrations` with
the baseline versions so it does not try to replay them. Do it as its own
change, with a schema diff between a chain-replayed and a baseline-replayed
database as the test.
