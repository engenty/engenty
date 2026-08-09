# Engenty production deploy

Single HTTPS origin (e.g. `https://app.example.com`) via the **production gateway** in `apps/core` (`ENGENTY_PROD_GATEWAY=1`):

| Path | Service |
|------|---------|
| `/api`, `/gateway` | Core Hono (in `engenty-edge`) |
| `/ai` | `engenty-ai` (proxied) |
| `/` | Built UI static assets |
| `/docs` | Optional Fumadocs (`--profile docs`) |
| `/studio` | Optional Mastra Studio (`--profile studio`) |

The `/manage` route serves the Manage admin portal (`apps/manage`), a superadmin control plane. It is **disabled by default** (`ENGENTY_GATEWAY_MANAGE_ENABLED=false`) and the gateway answers 404. The edge image bundles the portal automatically when `apps/manage` is present at build time (PRO builds); the open-source build omits it and leaves `ENGENTY_GATEWAY_MANAGE_ROOT` (default `/app/manage`) empty, so `/manage` 404s even if enabled. To turn it on for a PRO deployment, set `ENGENTY_GATEWAY_MANAGE_ENABLED=true` in compose/Coolify — no manual build or copy step is needed; the gateway then serves the static build (superadmin-gated) under `/manage`.

Coolify (or any reverse proxy) terminates TLS and forwards to **engenty-edge** on port **8787**. Do not expose `engenty-ai` publicly unless debugging.

Step-by-step walkthrough: [docs/content/setup/coolify.md](../docs/content/setup/coolify.md)

**Guided setup:** `node deploy/scripts/deploy-wizard.mjs` — an interactive stepper
that collects your Supabase + Coolify credentials, configures the exposed schemas
and auth hook, writes `deploy/.env` (print or apply), then creates the Coolify app
and deploys. `--dry-run` walks the flow without writing anything.

---

## Prerequisites

- Docker on the VPS (or local smoke)
- [Coolify](https://coolify.io/) with a domain and TLS (production)
- Supabase (self-hosted or cloud) reachable from the Engenty Docker network
- Node.js `>=24.11.0` + [Supabase CLI](https://supabase.com/docs/guides/cli) on a machine that can run migrations
- Secrets: `ENGENTY_SECURITY_JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `AI_GATEWAY_API_KEY`, optional `OPENAI_API_KEY`

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
bash deploy/scripts/migrate.sh           # aggregate module SQL + supabase db push
```

Two settings live in **project config, not migrations**, so the migrate step cannot set them — do them once or they bite at runtime:

- **Exposed schemas** (Supabase → Settings → API → Exposed schemas): add every schema listed under `[api].schemas` in `supabase/config.toml` (`ai`, `core`, `context_graph`, `search`, and the `module_*` schemas). Missing this → `engenty-ai` crash-loops with `Could not query the database for the schema cache`.
- **Custom access token hook** (Supabase → Authentication → Hooks → Customize Access Token): select `core.custom_access_token_hook` (it ships in the migrations, grants included). Missing this → JWTs lack the `tenant_id` claim, realtime live updates silently stay off, and the client retries token refresh into `429`s. Users must sign out/in after enabling.

---

## 2. Configure environment

```bash
cp deploy/.env.example deploy/.env
```

Edit `deploy/.env`. Required:

| Variable | Notes |
|----------|--------|
| `PUBLIC_APP_URL` | HTTPS app URL, **no trailing slash** |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Baked into the UI at **image build** |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ANON_KEY` | Runtime (edge + ai) |
| `ENGENTY_SECURITY_JWT_SECRET` | Long random string |
| `ENGENTY_CORS_ORIGINS` | Comma-separated origins allowed to call `/ai` |
| `AI_GATEWAY_API_KEY` | Vercel AI Gateway |

Optional flags in `deploy/.env`:

- `ENGENTY_GATEWAY_DOCS_ENABLED=true` + start `--profile docs`
- `ENGENTY_GATEWAY_STUDIO_ENABLED=true` + start `--profile studio`

> Both halves are required. The gateway flag alone points `/docs` at a container
> that was never started, so every docs URL returns 502 — which is exactly how
> prod ran until v0.1.112. On Coolify there is no `--profile` flag: set
> `COMPOSE_PROFILES=docs` in the application's environment instead.
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

**Rebuild** edge images after changing any `VITE_*` value (Supabase URL/anon key, `PUBLIC_APP_URL`).

`engenty-edge` carries a `traefik.docker.network=coolify` label: the container sits on several Docker networks and Traefik otherwise picks one arbitrarily per start — landing on the internal `engenty` network (which the proxy can't reach) returns **504 Gateway Timeout**. Keep the label. Note `${...}` substitution is **not** allowed in compose `volumes:` under Coolify — the sandbox mount is a literal path for that reason.

To build the images on GitHub Actions instead of on the VPS, see **Prebuilt images via CI** below.

---

## Prebuilt images via CI (GitHub Actions → GHCR)

`.github/workflows/build-images.yml` builds the `edge`, `ai`, `sandbox`, and `app-host` images on GitHub runners and pushes them to `ghcr.io/<org>/engenty-{edge,ai,sandbox,app-host}` on each push to `main`. Point Coolify at **`docker-compose.prebuilt.yaml`** (base directory still `/deploy`) — it pulls those images instead of building, so deploys take ~2 min instead of ~25.

Setup:

1. **Repo variables** (Actions → Variables) on the repo the workflow runs in: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `PUBLIC_APP_URL` (baked into the UI at build time), and `COOLIFY_DEPLOY_ENABLED`. Set them on the **correct** repo — `gh variable set` without `-R` targets whatever remote your checkout points at, which may not be where CI runs. Empty `VITE_*` bakes a UI that can't reach Supabase (login fails) **with no build error** — verify a built bundle contains your Supabase host.
2. **GHCR pull on the VPS** (images are private): `docker login ghcr.io -u <user> -p <PAT-with-read:packages>` once; the credential persists in `/root/.docker/config.json`.
3. **Coolify**: switch the app's compose file to `docker-compose.prebuilt.yaml`.

**Auto-deploy trigger.** The `deploy` job (gated on `COOLIFY_DEPLOY_ENABLED=true`) triggers the redeploy. Coolify's API is IP-allowlisted and GitHub runner IPs are dynamic, so it deploys **over SSH** rather than the HTTP API: a key pinned to a forced command (`deploy/scripts/coolify-deploy.sh`) queues the deployment via Coolify's own helper, leaving the API allowlist untouched. This path needs:

- On the VPS: install `deploy/scripts/coolify-deploy.sh` to `/opt/coolify-deploy.sh` (mode 750) and add a forced-command `authorized_keys` entry — `command="/opt/coolify-deploy.sh",no-pty,no-port-forwarding,no-x11-forwarding,no-agent-forwarding <ci-public-key>`.
- In GitHub: secret `VPS_DEPLOY_SSH_KEY` (the CI private key) and variable `VPS_DEPLOY_HOST` (VPS host/IP).

Set `COOLIFY_DEPLOY_ENABLED=false` to keep the `deploy` job dormant while still building images on push (e.g. if you trigger deploys manually from an allowlisted IP instead).

---

## 5. Smoke checklist

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
| New module migrations | `bash deploy/scripts/migrate.sh` |

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
| `Dockerfile.edge` | Core API + prod gateway + UI static |
| `Dockerfile.ai` | AI service |
| `Dockerfile.sandbox` | Agent sandbox runtime image (build-only) |
| `Dockerfile.app-host` | engenty Apps runtime (internal only — no published port, no gateway route) |

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
- It needs a **durable volume**. RivetKit keeps deployed app releases under
  `$HOME/.rivetkit` (`HOME=/data` in the image, mounted as
  `engenty-app-host-data`). Losing that volume takes every deployed App offline
  until each is redeployed from its stored source in Postgres.

To take Apps out of service: `ENGENTY_APPS_ENABLED=false` on `engenty-edge`
removes the whole operation surface. A single App is disabled with
`app_archive`; a single tenant, by module licensing.

`ENGENTY_APP_HOST_TOKEN` is also the reason the two services must be restarted
together after rotating it — `engenty-ai` presents it on every call.

| `Dockerfile.studio` | Mastra Studio (profile) |
| `Dockerfile.docs` | Fumadocs Next (profile) |
| `.env.example` | Env template (generated — `pnpm env:example:write`) |
| `scripts/migrate.sh` | Aggregate + push migrations |
| `scripts/coolify-deploy.sh` | Forced-command SSH deploy trigger used by the CI `deploy` job |

The image build + auto-deploy pipeline itself lives at `.github/workflows/build-images.yml`.
