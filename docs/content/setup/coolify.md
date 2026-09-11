---
title: VPS deployment with Coolify
description: Deploy the full Engenty stack to a VPS managed by Coolify, behind a single HTTPS domain.
---

# VPS deployment with Coolify

This guide takes you from a freshly cloned repository to a running Engenty
instance on your own server, using [Coolify](https://coolify.io/) to manage the
Docker stack and TLS. No prior Engenty knowledge is assumed — follow the steps in
order.

## How it fits together

Everything is served from **one HTTPS domain** (for example
`https://app.example.com`). Coolify terminates TLS and forwards all traffic to a
single service called **`engenty-edge`** on port **8787**. That service routes
each path to the right place:

| Path | What it serves |
|------|----------------|
| `/` | The main app (UI) |
| `/api`, `/gateway` | The backend API |
| `/ai` | The AI service (proxied internally) |
| `/docs` | These docs (optional) |
| `/studio` | The agent playground (optional) |

The database and authentication are handled by **Supabase**, which you deploy
separately (it is **not** part of this stack).

## Before you begin

You'll need:

- A **VPS** with **Docker** installed and **Coolify** set up.
- A **domain name** pointed at the server, with TLS handled by Coolify
  (Let's Encrypt).
- A **Supabase** instance — self-hosted or [Supabase Cloud](https://supabase.com/) —
  reachable from the server.
- **Node.js `>=24.11.0`** and pnpm on the machine you'll run migrations from
  (this can be your laptop). `pnpm install` vendors the Supabase CLI.
- API keys: an `AI_GATEWAY_API_KEY` (Vercel AI Gateway) and credentials for your
  LLM provider.

> **Fast path — the guided wizard.** Once you've cloned the repo (Step 1), you
> can run `node deploy/scripts/deploy-wizard.mjs` instead of the manual steps
> below. It's an interactive stepper that collects your Supabase + Coolify
> credentials, sets the exposed schemas and auth hook, writes `deploy/.env`, and
> creates + deploys the Coolify app — pausing for confirmation before each
> change. `--dry-run` walks the whole flow writing nothing. The manual walkthrough
> below is still the reference for what the wizard does under the hood.

## Step 1 — Get the code

Clone the repository onto the machine you'll run migrations from:

```bash
git clone <your-fork-or-repo-url> engenty
cd engenty
```

All commands below are run from the **repository root** unless noted otherwise.

## Step 2 — Set up Supabase

Engenty stores its data and users in Supabase. Deploy Supabase first, then point
it at your app:

1. In the Supabase dashboard, set:
   - **Site URL:** your app URL, e.g. `https://app.example.com`
   - **Redirect URLs:** `https://app.example.com`
2. Link the CLI and apply the Engenty database schema:

   ```bash
   supabase link --project-ref <your-project-ref>
   bash deploy/scripts/migrate.sh
   ```

   `migrate.sh` gathers all module SQL into `supabase/migrations/` and runs
   `supabase db push` for you.

3. **Expose the Engenty schemas through the API.** Migrations create the
   schemas but cannot change the project's API config, and by default hosted
   Supabase only serves `public` — the AI service then crash-loops with
   `Could not query the database for the schema cache`. In the dashboard under
   **Settings → API → Exposed schemas** (or via the Management API), set the
   list to match `[api].schemas` in `supabase/config.toml`:

   ```
   public, graphql_public, ai, context_graph, core,
   module_commercial_settings, module_company_profile, module_connections,
   module_contacts, module_files, module_inbox, module_invoices, module_kb,
   module_local_files, module_offers, module_pdf_templates, module_projects,
   module_tasks, module_team, module_time_tracking, search
   ```

4. **Enable the custom access token hook.** Like exposed schemas, auth hooks
   are project config that migrations cannot set — without it, JWTs lack the
   `tenant_id` claim, realtime live updates silently stay off (console warning
   `token claims do not match the workspace tenant`), and the client retries
   session refreshes until Supabase rate-limits with 429s. Under
   **Authentication → Hooks → Customize Access Token (JWT) Claims**, select the
   Postgres function `core.custom_access_token_hook` (it ships with the
   migrations, including its grants) — this mirrors `[auth.hook.custom_access_token]`
   in `supabase/config.toml`. Users must sign out and back in after enabling.

> **Tip:** keep the Supabase **service role key**, **anon key**, and **URL**
> handy — you'll need them in the next step.

## Step 3 — Configure environment variables

Copy the example file and fill in your values:

```bash
cp deploy/.env.example deploy/.env
```

Open `deploy/.env` and set at least these:

| Variable | What to put |
|----------|-------------|
| `PUBLIC_APP_URL` | Your HTTPS app URL, **no trailing slash** |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Supabase URL + anon key (baked into the UI at build time) |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ANON_KEY` | Supabase values used by the backend at runtime |
| `ENGENTY_SECURITY_JWT_SECRET` | A long random string (e.g. `openssl rand -hex 32`) |
| `ENGENTY_CORS_ORIGINS` | Comma-separated allowed origins; include your app URL |
| `AI_GATEWAY_API_KEY` | Your Vercel AI Gateway key |

> **Important:** the `VITE_*` values are baked into the frontend when the image is
> **built**. If you change any of them later, you must **rebuild** the edge image
> (Step 5 / the rebuild note below).

Set these too, unless you want the matching feature switched off. They are
read from the process environment at boot and **cannot** be set from
**Setup → Platform settings** — that page shows them as read-only *Set / Not
set* rows so a missing one is visible before it breaks a flow:

| Variable | Generate | What breaks without it |
|----------|----------|------------------------|
| `CONNECTIONS_TOKEN_ENC_KEY` | `openssl rand -base64 32` | Every OAuth connect fails at the *end*: the provider returns tokens, storing them raises "cannot encrypt/decrypt connection tokens", and the UI redirects to `?error=exchange_failed` |
| `ENGENTY_APP_HOST_TOKEN` | `openssl rand -hex 32` | engenty Apps unavailable. Only needed with the `apps` profile below — without that profile the service is not started at all |
| `ENGENTY_AI_SERVICE_SECRET` | `engenty service-token create --name ai-service` | Scheduler stays disabled — no routine or system job ever fires |

`CONNECTIONS_TOKEN_ENC_KEY` is permanent: rotating it makes every stored
connection token undecryptable and all connections have to be re-authorized.
Set it before your first connection, not after.

For `ENGENTY_AI_SERVICE_SECRET`, log in against the deployment first
(`engenty auth login --api-url https://your-domain`), then create the
credential — it prints `<credentialId>.<secret>` once. It is revocable
(`engenty service-token revoke`). See
[service identity](../dev/service-identity.md).

## Step 4 — Add the app in Coolify

In your Coolify dashboard:

1. Create a new **Docker Compose** application.
2. Set the **base directory** to `/deploy` and the **compose file** to
   `docker-compose.yaml`. (Not the repo root: Coolify resolves the compose
   file's relative paths against the base directory, so the `context: ..`
   build contexts only land on the repo root when the base directory is
   `/deploy`.)
3. Paste the variables from your `deploy/.env` into Coolify's environment
   settings (or upload the file). On a small VPS also add
   `TURBO_BUILD_CONCURRENCY=4` — the two app images build in parallel and the
   default concurrency of 10 each can freeze a 4-core host.
4. Route your **domain** to the service **`engenty-edge`** on port **8787**.
5. Make sure Supabase is reachable from the app's Docker network, and set
   `SUPABASE_URL` to a URL the **containers** can reach (not just your browser).
6. Deploy.

Coolify will build the images and start the stack (the `engenty-edge`,
`engenty-ai`, and `gotenberg` services).

### Optional: docs and the agent playground

Three extras are off by default and enabled with compose **profiles**. Both halves
matter: the gateway flag alone points the route at a container that was never
started, and every request to it then returns 502.

- **Docs** (`/docs`): set `ENGENTY_GATEWAY_DOCS_ENABLED=true` and enable the
  `docs` profile in Coolify by adding `COMPOSE_PROFILES=docs` to the
  application's environment variables (Coolify has no `--profile` flag).
- **Studio** (`/studio`): set `ENGENTY_GATEWAY_STUDIO_ENABLED=true` and
  `ENGENTY_GATEWAY_STUDIO_BASIC_AUTH=operator:change-me`, then enable the
  `studio` profile. Studio is protected by HTTP basic auth.
- **engenty Apps** (`engenty-app-host`): set `ENGENTY_APP_HOST_TOKEN` and enable
  the `apps` profile. The module that drives it is not part of the open-source
  build, so the service stays off unless you ask for it. Unlike the two above it
  has no gateway route to 502 — it simply is not there, and app builds fail.

### Optional: build images in CI instead of on the server

The steps above build the images on the VPS, which is simple but slow (~25 min)
and heavy on a small box. Release tags can instead build immutable images in
GitHub Actions for the server to pull.

Two layouts are available:

- `docker-compose.prebuilt.yaml`: one Coolify application, simpler, with a
  stop/start window on every deployment;
- edge blue-green: two edge applications plus a stable backend, keeping the
  public UI and core API available through releases.

The operator setup, migration contract, promotion, and rollback procedure for
blue-green is in
[`deploy/BLUE-GREEN.md`](https://github.com/engenty/engenty/blob/main/deploy/BLUE-GREEN.md).
The general GHCR setup remains in
[`deploy/DEPLOY.md`](https://github.com/engenty/engenty/blob/main/deploy/DEPLOY.md).

> **Watch out:** the `VITE_*` repo variables must live on the repo the workflow
> actually runs in, and must be non-empty — an empty `VITE_SUPABASE_URL` builds a
> UI that can't reach Supabase (login silently fails) with no build error.

## Step 5 — Verify it works

Once Coolify reports the stack as healthy, check the basics from your terminal:

```bash
curl -sf https://<your-domain>/api/openapi.json   # backend is up
curl -sf https://<your-domain>/ai/health          # AI service is up
```

Then in a browser:

- [ ] Sign in with a Supabase user.
- [ ] The module list loads.
- [ ] Open the copilot at `/module/engenty-copilot/chat/new` and confirm a
      message **streams** a reply.
- [ ] (If enabled) `/docs` loads and `/studio` prompts for basic auth.

If all of these pass, your instance is live. 🎉

## Updating and day-to-day operations

You can run these from the server (or trigger a redeploy in Coolify):

| Task | Command |
|------|---------|
| View edge logs | `docker logs -f engenty-edge` |
| View AI logs | `docker logs -f engenty-ai` |
| Rebuild after a code or `VITE_*` change | `docker compose -f deploy/docker-compose.yaml --env-file deploy/.env up -d --build` |
| Apply new module migrations | `bash deploy/scripts/migrate.sh` |

## Troubleshooting

- **The UI loads but login fails or calls are blocked.** Re-check
  `PUBLIC_APP_URL`, `ENGENTY_CORS_ORIGINS`, and the Supabase **Redirect URLs** —
  they must all match your real domain.
- **The app can't reach the database.** `SUPABASE_URL` must be reachable from
  inside the containers. A URL that works in your browser is not always routable
  from the Docker network — put Supabase on the same network or use an internal
  URL.
- **The domain returns `504 Gateway Timeout` (often only after a redeploy).**
  Traefik is routing to a Docker network the proxy can't reach. The
  `engenty-edge` service carries a `traefik.docker.network=coolify` label to
  pin this — keep it; if you removed it, add it back and redeploy.
- **You changed a Supabase key or the app URL and nothing updated.** Those are
  `VITE_*` build-time values — **rebuild** the edge image so they're baked in.
- **The AI service won't respond.** Confirm `AI_GATEWAY_API_KEY` and your LLM
  provider credentials are set on the `engenty-edge` service, and check
  `docker logs -f engenty-ai`.
- **The AI service crash-loops with `Could not query the database for the
  schema cache`.** The Engenty schemas aren't exposed through the Supabase
  API — see the exposed-schemas step in Step 2.
- **Connecting a Google/Microsoft/Slack account ends on
  `?error=exchange_failed`.** The provider side is usually fine — check
  `docker logs engenty-edge | grep "oauth code exchange failed"` for the real
  reason. The common one is a missing `CONNECTIONS_TOKEN_ENC_KEY` (Step 3);
  the second is a redirect URI that does not match the one the setup screen
  shows, character for character.
- **A CLI or API call fails with `permission denied for table <x>`.** A
  database GRANT is missing for `service_role`, not an RLS problem (RLS denial
  reads as an empty result or a policy violation). Run
  `pnpm check:grants-coverage` against a migrated database to list every
  affected table; the fix is a migration, see
  [CI pipeline](../dev/ci-pipeline.md).
- **Coolify rejects the deploy with `Invalid volume target: contains forbidden
  character '${'`.** Coolify forbids variable substitution in compose volume
  definitions; the sandbox mount in `deploy/docker-compose.yaml` is a literal
  path for this reason — keep it that way.

## Reference

For the underlying compose files and a more terse operator-focused reference,
see `deploy/DEPLOY.md` in the repository.
