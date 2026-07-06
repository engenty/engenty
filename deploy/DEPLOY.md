# Engenty production deploy

Single HTTPS origin (e.g. `https://app.example.com`) via the **production gateway** in `apps/core` (`ENGENTY_PROD_GATEWAY=1`):

| Path | Service |
|------|---------|
| `/api`, `/gateway` | Core Hono (in `engenty-edge`) |
| `/ai` | `engenty-ai` (proxied) |
| `/` | Built UI static assets |
| `/docs` | Optional Fumadocs (`--profile docs`) |
| `/studio` | Optional Mastra Studio (`--profile studio`) |

The `/manage` route (closed-source Manage admin portal, `apps/manage`) is not part of this repository; the gateway keeps it disabled (`ENGENTY_GATEWAY_MANAGE_ENABLED=false`) and answers 404 on `/manage`.

Coolify (or any reverse proxy) terminates TLS and forwards to **engenty-edge** on port **8787**. Do not expose `engenty-ai` publicly unless debugging.

Step-by-step walkthrough: [docs/content/setup/coolify.md](../docs/content/setup/coolify.md)

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

Link the CLI and apply Engenty schema:

```bash
supabase link --project-ref <your-ref>   # or self-hosted equivalent
bash deploy/scripts/migrate.sh
```

`migrate.sh` aggregates module SQL into `supabase/migrations/` then runs `supabase db push`.

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

1. Add a **Docker Compose** application; base directory = repo root; compose file = `deploy/docker-compose.yaml`.
2. Paste env vars from `deploy/.env` (or upload as env file).
3. Route the domain to service **`engenty-edge`**, port **8787**.
4. Enable compose profiles in Coolify if you use **studio** or **docs** (match `ENGENTY_GATEWAY_*_ENABLED`).
5. Put Supabase on the same Docker network (or routable internal URL) and set `SUPABASE_URL` to the URL **containers** can reach.

**Rebuild** edge images after changing any `VITE_*` value (Supabase URL/anon key, `PUBLIC_APP_URL`).

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
| `docker-compose.yaml` | Stack: edge, ai, gotenberg; profiles studio, docs |
| `Dockerfile.edge` | Core API + prod gateway + UI static |
| `Dockerfile.ai` | AI service |
| `Dockerfile.sandbox` | Agent sandbox runtime image (build-only) |
| `Dockerfile.studio` | Mastra Studio (profile) |
| `Dockerfile.docs` | Fumadocs Next (profile) |
| `.env.example` | Env template (generated — `pnpm env:example:write`) |
| `scripts/migrate.sh` | Aggregate + push migrations |
