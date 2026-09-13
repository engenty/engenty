# Engenty production deploy

Single HTTPS origin (e.g. `https://app.example.com`) via the **production gateway** in `apps/core` (`ENGENTY_PROD_GATEWAY=1`):

| Path | Service |
|------|---------|
| `/api`, `/gateway` | Core Hono (in `engenty-edge`) |
| `/ai` | `engenty-ai` (proxied) |
| `/` | Built UI static assets |
| `/docs` | Optional Fumadocs (`--profile docs`) |
| `/studio` | Optional Mastra Studio (`--profile studio`) |

The `/manage` route serves the Manage admin portal (`apps/manage`), a superadmin control plane. It is **disabled by default** (`ENGENTY_GATEWAY_MANAGE_ENABLED=false`) and the gateway answers 404. The edge image bundles the portal automatically when `apps/manage` is present at build time (PRO builds); the public build omits it and leaves `ENGENTY_GATEWAY_MANAGE_ROOT` (default `/app/manage`) empty, so `/manage` 404s even if enabled. To turn it on for a PRO deployment, set `ENGENTY_GATEWAY_MANAGE_ENABLED=true` in compose/Coolify — no manual build or copy step is needed; the gateway then serves the static build (superadmin-gated) under `/manage`.

Coolify (or any reverse proxy) terminates TLS and forwards to **engenty-edge** on port **8787**. Do not expose `engenty-ai` publicly unless debugging.

Step-by-step walkthrough: [docs/content/setup/coolify.md](../docs/content/setup/coolify.md)

**Guided setup:** `npx engenty deploy` from anywhere — on the server it writes `./engenty-deploy/`
(the `.env` and the compose files) so no clone is needed; inside a checkout the same wizard is
`pnpm engenty deploy` and works in `deploy/`. `--dry-run` walks it without writing. An interactive
stepper. It first asks where Supabase runs (Cloud, or self-hosted on Coolify /
Dokploy / your own compose) and how engenty runs (Coolify, or Docker Compose on
a VPS), and the rest of the flow follows from those two answers:

- **Supabase Cloud** — reads your keys, sets the exposed schemas and the auth
  hook over the Management API.
- **Self-hosted Supabase** — prints the exact `PGRST_DB_SCHEMAS` and
  `GOTRUE_HOOK_CUSTOM_ACCESS_TOKEN_*` lines for you to set, since there is no
  Management API to do it through.
- **Coolify** — creates the application and triggers the first deployment.
- **Docker Compose** — writes `deploy/.env` and hands you the commands, plus a
  Caddy snippet for TLS in front of `engenty-edge:8787`.

Either Supabase path ends by *checking* both settings against the running
database rather than trusting they were made — the same probes as
`pnpm engenty doctor`. `--dry-run` walks the flow without writing anything.

**Checking an install:** `pnpm engenty doctor` — verifies the two Supabase
project settings this repo cannot set for you (§1). Run it after any change to
the database or to Supabase's own configuration, not only at install time.

**Upgrading a 0.1.x install:** [UPGRADE-0.1-to-0.2.md](./UPGRADE-0.1-to-0.2.md).
0.2.0 needs host preparation and two new exposed schemas before the deploy, and
it deletes some data on purpose — do not treat it as a routine release.

---

## Prerequisites

- Docker on the VPS (or local smoke)
- [Coolify](https://coolify.io/) with a domain and TLS (production)
- Supabase (self-hosted or cloud) reachable from the Engenty Docker network
- Node.js `>=24.11.0` + pnpm on a machine that can run migrations (`pnpm install` vendors the Supabase CLI)
- Secrets: `ENGENTY_SECURITY_JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `AI_GATEWAY_API_KEY`, optional `OPENROUTER_API_KEY` and `OPENAI_API_KEY`

---

## 1. Supabase

Deploy Supabase separately (not in this compose file). In the Supabase dashboard set:

- **Site URL:** `PUBLIC_APP_URL` (e.g. `https://app.example.com`)
- **Redirect URLs:** `https://app.example.com`

**Migrations run automatically on deploy.** Set `SUPABASE_DB_URL` (a direct
Postgres connection string — the service-role key can't run DDL) in the deploy
env and the `engenty-migrate` init service applies pending migrations before the
app starts, on every deploy. The app waits for it (`depends_on:
service_completed_successfully`), so no container ever serves a stale schema; a
migration failure fails the deploy visibly instead.

```bash
# Supabase Cloud (Settings → Database → Connection string → URI):
SUPABASE_DB_URL=postgresql://postgres:<pw>@db.<ref>.supabase.co:5432/postgres
# Self-hosted: postgresql://postgres:<pw>@<db-host>:5432/postgres
```

If `SUPABASE_DB_URL` is unset the migrate step is skipped (non-breaking for
existing installs) — apply the schema manually instead:

```bash
supabase link --project-ref <your-ref>   # or self-hosted equivalent
pnpm engenty deploy migrate              # aggregate module SQL + supabase db push
```

Without a checkout: `npx engenty deploy migrate` pushes the release's own
migrations with `SUPABASE_DB_URL` from `./engenty-deploy/.env` or the environment
(it fetches the pinned Supabase CLI for the run).

Two settings live in **project config, not migrations**, so the migrate step cannot set them — do them once or they bite at runtime:

- **Exposed schemas** (Supabase → Settings → API → Exposed schemas): add every schema `node scripts/supabase-schemas.mjs` prints (`ai`, `core`, `context_graph`, `search`, and the `module_*` schemas). Missing this → `engenty-ai` crash-loops with `Could not query the database for the schema cache`.
- **Custom access token hook** (Supabase → Authentication → Hooks → Customize Access Token): select `core.custom_access_token_hook` (it ships in the migrations, grants included). Missing this → JWTs lack the `tenant_id` claim, realtime live updates silently stay off, and the client retries token refresh into `429`s. Users must sign out/in after enabling.

Both fail quietly, so check them rather than trusting the click:

```bash
pnpm engenty doctor --remote --url https://<ref>.supabase.co \
  --anon-key <anon> --service-key <service_role>
```

It exits non-zero on a problem, and with `--remote` alone reads `SUPABASE_URL`,
`SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` from the environment. It
runs from a checkout, not from inside a container — so against a deployment,
load the same env the stack uses:

```bash
set -a; . deploy/.env; set +a
pnpm engenty doctor --remote
```

```text
✓ Exposed schemas — all 29 required schemas are served
✓ Access-token hook — core.custom_access_token_hook exists and auth can call it
    257 migrations applied, latest 20260911120000
```

A missing schema is named, and the paste-ready `PGRST_DB_SCHEMAS=…` line for a
self-hosted PostgREST comes with it. The hook side calls
`core.deployment_self_check()` (service-role only) and reports the function and
each of the four grants GoTrue needs separately, so "all four false" reads as
*migrations have not run here* rather than as a hook problem.

The list of required schemas comes from the migration sources in the checkout,
so it is correct on a bare clone — `supabase/config.toml` is generated and
gitignored, and its committed template carries only the five base schemas. To
print the list without running a check:

```bash
node scripts/supabase-schemas.mjs
```

If the hook is disabled at runtime, `engenty-edge` also says so once in its own
log — a valid Supabase token with no `tenant_id` claim is otherwise an
unexplained `Unauthorized`.

---

## 2. Configure environment

```bash
cp deploy/.env.example deploy/.env
```

Edit `deploy/.env`. Required:

| Variable | Notes |
|----------|--------|
| `PUBLIC_APP_URL` | HTTPS app URL, **no trailing slash** |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ANON_KEY` | From the Supabase project (edge + ai) |
| `ENGENTY_SECURITY_JWT_SECRET` | Long random string |
| `AI_GATEWAY_API_KEY` | Vercel AI Gateway — needed for anything the copilot does |

Four more the install used to demand and now derives. Set one only to override
its default:

| Variable | Default |
|----------|---------|
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | `SUPABASE_URL` / `SUPABASE_ANON_KEY`, written into the served page by the gateway. Set when the browser-facing address differs — a container-internal `SUPABASE_URL` is the usual reason. |
| `ENGENTY_CORS_ORIGINS` | `PUBLIC_APP_URL`. A single-origin install needs nothing else; set it to allow additional origins. |
| `OPENROUTER_API_KEY` | unset — every model role runs on Vercel. |

Optional flags in `deploy/.env`:

- `ENGENTY_GATEWAY_DOCS_ENABLED=true` + start `--profile docs`
- `ENGENTY_GATEWAY_STUDIO_ENABLED=true` + start `--profile studio`
- engenty Apps: `ENGENTY_APP_HOST_TOKEN=<secret>` + start `--profile apps`

> Both halves are required. The gateway flag alone points `/docs` at a container
> that was never started, so every docs URL returns 502 — which is exactly how
> prod ran until v0.1.112. On Coolify there is no `--profile` flag: set
> `COMPOSE_PROFILES=docs` in the application's environment instead.

> **engenty Apps is a profile too, for the same reason in reverse.** The module
> that drives `engenty-app-host` (`modules/engenty-apps`) is PRO-only, so a
> public build has nothing that can call it — and the service refuses to boot in
> production without `ENGENTY_APP_HOST_TOKEN`, which would leave every
> open-source install crash-looping a container it never asked for. A PRO
> deployment on `docker-compose.yaml` or `docker-compose.prebuilt.yaml` must
> therefore pass `--profile apps` (or `COMPOSE_PROFILES=apps`) to **both**
> `build` and `up` — profile-gated services are skipped by `docker compose
> build`, so without it the image is never built and app builds fail against a
> host that was never started. The blue-green production layout does not use
> profiles: `docker-compose.backend.prebuilt.yaml` runs app-host always.
- `ENGENTY_GATEWAY_STUDIO_BASIC_AUTH=operator:secret` — HTTP basic auth on `/studio`

**Inbox OAuth:** redirect URI `https://<host>/api/inbox/oauth/callback` in Google/Azure; set `GMAIL_*` / `OUTLOOK_*` on `engenty-edge`.

---

## 3. Build and run (Docker Compose)

From the **repository root**:

```bash
docker compose -f deploy/docker-compose.yaml --env-file deploy/.env build
docker compose -f deploy/docker-compose.yaml --env-file deploy/.env up -d
```

**Optional Studio** — set in `deploy/.env` first:

```bash
ENGENTY_GATEWAY_STUDIO_ENABLED=true
ENGENTY_GATEWAY_STUDIO_BASIC_AUTH=operator:change-me
```

```bash
docker compose -f deploy/docker-compose.yaml --env-file deploy/.env --profile studio up -d
```

Open `https://<host>/studio` (browser prompts for basic auth). Studio calls `/ai` on the same origin.

**Optional Docs:**

```bash
# ENGENTY_GATEWAY_DOCS_ENABLED=true in deploy/.env
docker compose -f deploy/docker-compose.yaml --env-file deploy/.env --profile docs up -d
```

Open `https://<host>/docs`.

---

## 4. Coolify

1. Add a **Docker Compose** application. Set **base directory** to `/deploy` and **compose file** to `docker-compose.yaml`. (Not the repo root — Coolify runs `docker compose --project-directory <base dir>`, so the `context: ..` build contexts only resolve to the repo root when the base directory is `/deploy`.)
2. Paste env vars from `deploy/.env` (or upload as env file). On a small VPS also set `TURBO_BUILD_CONCURRENCY=4` — the two app images build in parallel and the default (10 each) can exhaust a 4-core host.
3. Route the domain to service **`engenty-edge`**, port **8787**.
4. Enable compose profiles in Coolify if you use **studio** or **docs** (match `ENGENTY_GATEWAY_*_ENABLED`).
5. Put Supabase on the same Docker network (or routable internal URL) and set `SUPABASE_URL` to the URL **containers** can reach.

`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and `VITE_ENGENTY_AI_BASE_URL`
take effect on **restart**, not on rebuild: the gateway writes them into every
HTML document it serves, ahead of the values Vite baked in (falling back to
`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `PUBLIC_APP_URL`). Set
`VITE_SUPABASE_URL` explicitly whenever `SUPABASE_URL` is a container-internal
address — a browser cannot resolve Docker DNS. Any *other* `VITE_*` value is
still baked and needs an image rebuild.

`engenty-edge` carries a `traefik.docker.network=coolify` label: the container sits on several Docker networks and Traefik otherwise picks one arbitrarily per start — landing on the internal `engenty` network (which the proxy can't reach) returns **504 Gateway Timeout**. Keep the label. Note `${...}` substitution is **not** allowed in compose `volumes:` under Coolify — the sandbox mount is a literal path for that reason.

To build the images on GitHub Actions instead of on the VPS, see **Prebuilt images via CI** below.

---

## Prebuilt images via CI (GitHub Actions → GHCR)

Two sets of images are published from the two repositories:

| Images | Built by | Contents | Access |
|--------|----------|----------|--------|
| `ghcr.io/engenty/engenty-*` | `publish-images.yml` on engenty/engenty | the open tree — no closed modules | public, no login |
| `ghcr.io/engenty/engenty-pro-*` | `build-images.yml` on engenty-pro | everything, Manage portal included | private |

Nothing has to be configured to choose between them. The compose files here
name the pro images in full, and `scripts/publish-open-snapshot.sh` drops the
`-pro` on its way to the mirror, so each repo's files already point at its own
packages. Image references deliberately carry no `${VAR:-default}`: Coolify's
compose parser ignores the fallback, and an unset variable collapses the
reference to an unpullable bare name **after** the old containers are gone —
that took the site down on 2026-07-07.

`.github/workflows/build-images.yml` builds the production images on GitHub
runners for release tags and pushes immutable version/SHA tags plus `latest` to
GHCR. Point Coolify at **`docker-compose.prebuilt.yaml`** (base directory still
`/deploy`) for a simple single-application deployment.

That combined deployment still has a stop/start window. Production installations
that require an uninterrupted public UI and core API should use the edge-only
blue-green layout in [BLUE-GREEN.md](./BLUE-GREEN.md).

Setup:

1. **Repo variables** (Actions → Variables) on the repo the workflow runs in: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `PUBLIC_APP_URL` and `COOLIFY_DEPLOY_ENABLED`. Set them on the **correct** repo — `gh variable set` without `-R` targets whatever remote your checkout points at, which may not be where CI runs. The `VITE_*` pair is now only the baked-in default: the deployment's own environment overrides it at serve time, so an image built with them empty still runs — it just needs them set on the container instead.
2. **GHCR pull on the VPS** (PRO images are private): `docker login ghcr.io -u <user> -p <PAT-with-read:packages>` once; the credential persists in `/root/.docker/config.json`. The public `engenty-*` images need no login.
3. **Coolify**: use `docker-compose.prebuilt.yaml` for the combined layout, or
   follow [BLUE-GREEN.md](./BLUE-GREEN.md) for the production layout.

**Auto-deploy trigger.** The `deploy` job (gated on
`COOLIFY_DEPLOY_ENABLED=true`) invokes the blue-green orchestrator over SSH.
The forced command handles pre-migration, candidate readiness, promotion, and
rollback; there is deliberately no queue-only API fallback.

- On the VPS: follow the server configuration and installation steps in
  [BLUE-GREEN.md](./BLUE-GREEN.md).
- In GitHub: secret `VPS_DEPLOY_SSH_KEY` (the CI private key) and variable `VPS_DEPLOY_HOST` (VPS host/IP).

Set `COOLIFY_DEPLOY_ENABLED=false` to build release images without promoting
them (for example, while bootstrapping the two edge applications).

---

## 5. Smoke checklist

- [ ] `pnpm engenty doctor` (exposed schemas + access-token hook)
- [ ] `curl -sf https://<host>/api/openapi.json`
- [ ] `curl -sf https://<host>/ai/health`
- [ ] Login (Supabase auth)
- [ ] Module list page loads
- [ ] Copilot: `/module/engenty-copilot/chat/new` streams
- [ ] Vault office preview (needs Gotenberg — included in compose)
- [ ] Optional: `/studio` (basic auth) and `/docs`

---

## 6. Local smoke (no TLS)

```bash
cp deploy/.env.example deploy/.env
# PUBLIC_APP_URL=http://localhost:8787
# VITE_* and SUPABASE_* pointing at local or remote Supabase
docker compose -f deploy/docker-compose.yaml --env-file deploy/.env up --build
```

---

## 7. Operations

| Task | Command |
|------|---------|
| Logs (edge) | `docker logs -f engenty-edge` |
| Logs (ai) | `docker logs -f engenty-ai` |
| Restart stack | `docker compose -f deploy/docker-compose.yaml --env-file deploy/.env restart` |
| Rebuild after code change | `docker compose -f deploy/docker-compose.yaml --env-file deploy/.env up -d --build` |
| New module migrations | `pnpm engenty deploy migrate` |
| Check Supabase wiring | `pnpm engenty doctor --remote` |

### Space computer & browser

A space with the **shared computer** switch on runs its Engentys' commands in
one long-lived container per space (`engenty-space-<tenant>-<space>`) instead
of a fresh container per run. Operator knobs, all env on `engenty-ai`:

| Variable | Default | Meaning |
|---|---|---|
| `ENGENTY_SPACE_COMPUTER_NETWORK_TIER` | `egress` | Default network of every space computer, overridable per space in **Space settings → Security → Computer network reach**. Set `none` to seal the whole host. Never per-agent: a machine's network is fixed by whichever run creates it, so it must not depend on agent declarations. `egress` needs the allowlist proxy below, or the machine reaches the whole internet through the default bridge. |
| `ENGENTY_SPACE_COMPUTER_IDLE_STOP_MS` | 30 min | Idle machines are `docker stop`ped (installed programs survive; the next command wakes them). |
| `ENGENTY_BROWSER_DOCKER_IMAGE` | the release's `engenty-browser` image | User browser image. Published per release like the sandbox image, and the prebuilt compose files set this to the fully qualified name — a bare name would send the host daemon to Docker Hub. Building on the server instead (`docker-compose.yaml`) builds it locally. |
| `ENGENTY_BROWSER_MEMORY_BYTES` | 1 GiB | Chromium's memory cap per user browser. |
| `ENGENTY_BROWSER_IDLE_STOP_MS` | 15 min | A user browser nobody used (no agent step, no open view) is `docker stop`ped; logins survive in the profile bind. |
| `ENGENTY_BROWSER_MAX_PER_TENANT` / `_PER_USER` | 4 / 2 | Running user browsers per tenant / per person, host-wide. Over the ceiling, Start answers 429. |
| `ENGENTY_BROWSER_EGRESS_NETWORK` / `ENGENTY_BROWSER_EGRESS_PROXY_URL` / `ENGENTY_BROWSER_VIEW_NETWORK` | set by compose | The browser's sealed network and proxy, and the view network it shares with `engenty-ai`. See below. |

Semantics worth knowing on-call: **Stop** (Computers view) puts a machine to
sleep — state kept; **Reset** removes the container — installed programs gone,
files kept (the workspace is a bind mount). Machines survive deploys (the
shutdown sweep stops rather than removes them). A "N waiting" badge on a
machine row means commands are serializing on it — expected under parallel
routine fires, a reason to split work across spaces if chronic.

### User browsers and sealed egress

Since the per-user browser (PLAN-user-browser.md) the stack runs **three
sealed networks and two proxies**. All three are `internal: true` — no NAT
gateway — so a container that ignores its proxy env has no route out at all.

| Network | Who is on it | Way out |
|---|---|---|
| `engenty-egress` | space computers and run sandboxes with tier `egress`, `engenty-egress-proxy` | the proxy only — **allowlist** (`deploy/egress-proxy/filter`, default-deny) |
| `engenty-browser-egress` | `engenty-browser-<tenant>-<space>-<user>` containers, `engenty-browser-proxy` | the proxy only — **blocklist** (`deploy/browser-proxy/filter`: our own containers, private ranges, metadata), every host logged at `LogLevel Connect` |
| `engenty-browser-view` | user browsers (attached after start) and `engenty-ai` | none; CDP on :9222 only |

Both proxies ALSO sit on the app network (`engenty` / `engenty-runtime`):
an internal network has no gateway, so that second membership is the
proxies' own route upstream. Removing it blackholes every sandbox install
silently — the smoke check for a deploy is `pip install` inside a machine
still working, and `curl --noproxy '*' https://example.com` from the same
machine failing.

**Upgrading an existing host:** Compose cannot flip `internal` on a network
that already exists. Before `up`, with the stack down:

```bash
docker network rm engenty-egress
```

Chromium in a user browser runs with `--proxy-server` and
`--proxy-bypass-list="<-loopback>"`, so it cannot reach `engenty-ai` on the
view network by name — the proxy is not on that network and cannot resolve
it. Where a browser went is the browser proxy's log:

```bash
docker logs engenty-browser-proxy | grep CONNECT
```

**Sign out vs Reset vs Stop** for a browser: *Stop* sleeps it (logins kept);
*Sign out* (Space settings → Computer, the person only) stops it and empties
the profile — the one action that forgets logins; *Reset* (Computers view)
removes the container and keeps the profile bind, so a reset browser is still
logged in. Machines never see a browser: agents browse through host-side
`browser_*` tools in the person's name, and a headless run (routine fire)
only does so when that person switched on **Let Engentys use it while I am
away**.

---

## 8. Not used in production

- `ENGENTY_DEV_GATEWAY=1` and the Portless local-URL setup
- `ENV=development` plugin hot-reload
- `ENGENTY_DEV_PASS` dev login bypass

---

## Files in `deploy/`

| File | Purpose |
|------|---------|
| `docker-compose.yaml` | Stack: edge, ai, gotenberg; profiles studio, docs (builds on host) |
| `docker-compose.prebuilt.yaml` | Same stack pulling prebuilt GHCR images (CI path, §"Prebuilt images via CI") |
| `docker-compose.edge.prebuilt.yaml` | One blue/green public edge color |
| `docker-compose.backend.prebuilt.yaml` | Stable AI, app-host, docs, and core worker |
| `docker-compose.migrate.prebuilt.yaml` | One-shot migration before edge promotion |
| `BLUE-GREEN.md` | Production bootstrap, promotion, and rollback guide |
| `UPGRADE-0.1-to-0.2.md` | One-time runbook for moving an existing 0.1.x install to 0.2.0 |
| `Dockerfile.edge` | Core API + prod gateway + UI static |
| `Dockerfile.ai` | AI service |
| `Dockerfile.sandbox` | Agent sandbox runtime image; published by CI, launched by `engenty-ai` |
| `Dockerfile.browser` | Per-user browser image (`engenty-browser`); published by CI, launched by `engenty-ai` |
| `Dockerfile.app-host` | engenty Apps runtime (internal only — no published port, no gateway route; `apps` profile) |

## engenty Apps (`engenty-app-host`)

`engenty-app-host` runs tenant-authored code, so it is deliberately the least
reachable service in the stack: no published port, no gateway route, no Traefik
labels. Only `engenty-ai` talks to it, over internal Docker DNS, with the shared
secret in `ENGENTY_APP_HOST_TOKEN`. **The service refuses to boot in production
without that token** — set it.

Two operational facts that differ from every other service here:

- It supervises **two native child processes** (`rivet-engine` and
  `agentos-sidecar`) that ship as platform-specific npm packages. The image must
  therefore be built for the architecture it will run on; the Dockerfile fails
  the build rather than the first deploy if the binaries are missing.
- It needs **durable storage**, twice over. RivetKit keeps deployed app
  releases under `$HOME/.rivetkit`. The combined layout mounts
  `engenty-app-host-data`; the blue-green backend binds
  `/opt/engenty/app-host-data` to `/data`. Losing that data takes every
  deployed App offline until each is redeployed from its stored source in
  Postgres. Separately, every App's source repository and its own data — the
  `node:sqlite` database and files mounted at `/data` inside the App's isolate
  — live on the spaces tree, `/opt/engenty/spaces/tenants/<tenant>/spaces/
  <space>/apps/<slug>/{src,data}` (`ENGENTY_SPACES_DIR`), bound 1:1 into
  `engenty-app-host` and `engenty-ai`. That tree is tenant data with no other
  copy: back it up (`deploy/scripts/backup-spaces.sh`).
- It runs as **uid 1000**, the space computer's `sandbox` user, because both
  write the same App directories. `/opt/engenty/spaces` must be owned by
  1000:1000 (`install -d -o 1000 -g 1000 /opt/engenty/spaces`), and an
  app-host store created by an earlier, root-running image needs a one-time
  `chown -R 1000:1000` — `/opt/engenty/app-host-data` on the blue-green host,
  or for the combined layout
  `docker run --rm -v engenty-app-host-data:/data alpine chown -R 1000:1000 /data`.

To take Apps out of service: `ENGENTY_APPS_ENABLED=false` on `engenty-edge`
removes the whole operation surface. A single App is disabled with
`app_archive`; a single tenant, by module licensing.

`ENGENTY_APP_HOST_TOKEN` is also the reason the two services must be restarted
together after rotating it — `engenty-ai` presents it on every call.

| `Dockerfile.studio` | Mastra Studio (profile) |
| `Dockerfile.docs` | Fumadocs Next (profile) |
| `.env.example` | Env template (generated — `pnpm env:example:write`) |
| `scripts/migrate.sh` | Aggregate + push migrations (`pnpm engenty deploy migrate`) |
| `scripts/coolify-deploy.sh` | Forced-command SSH deploy trigger used by the CI `deploy` job |

The PRO image build + auto-deploy pipeline lives at
`.github/workflows/build-images.yml`. The public images come from
`.github/workflows/publish-images.yml`, which runs on engenty/engenty only and
has to be installed on that repo by hand — the open-source sync deliberately
keeps the mirror's own workflows rather than overwriting them with pro's.
