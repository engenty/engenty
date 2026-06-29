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
| `/manage` | The admin portal |
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
- **Node.js `>=24.11.0`** and the [Supabase CLI](https://supabase.com/docs/guides/cli)
  on the machine you'll run migrations from (this can be your laptop).
- API keys: an `AI_GATEWAY_API_KEY` (Vercel AI Gateway) and credentials for your
  LLM provider.

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
   - **Redirect URLs:** `https://app.example.com` and `https://app.example.com/manage`
2. Link the CLI and apply the Engenty database schema:

   ```bash
   supabase link --project-ref <your-project-ref>
   bash deploy/scripts/migrate.sh
   ```

   `migrate.sh` gathers all module SQL into `supabase/migrations/` and runs
   `supabase db push` for you.

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

## Step 4 — Add the app in Coolify

In your Coolify dashboard:

1. Create a new **Docker Compose** application.
2. Set the **base directory** to the repository root and the **compose file** to
   `deploy/docker-compose.yml`.
3. Paste the variables from your `deploy/.env` into Coolify's environment
   settings (or upload the file).
4. Route your **domain** to the service **`engenty-edge`** on port **8787**.
5. Make sure Supabase is reachable from the app's Docker network, and set
   `SUPABASE_URL` to a URL the **containers** can reach (not just your browser).
6. Deploy.

Coolify will build the images and start the stack (the `engenty-edge`,
`engenty-ai`, and `gotenberg` services).

### Optional: docs and the agent playground

Two extras are off by default and enabled with compose **profiles**:

- **Docs** (`/docs`): set `ENGENTY_GATEWAY_DOCS_ENABLED=true` and enable the
  `docs` profile in Coolify.
- **Studio** (`/studio`): set `ENGENTY_GATEWAY_STUDIO_ENABLED=true` and
  `ENGENTY_GATEWAY_STUDIO_BASIC_AUTH=operator:change-me`, then enable the
  `studio` profile. Studio is protected by HTTP basic auth.

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
| Rebuild after a code or `VITE_*` change | `docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build` |
| Apply new module migrations | `bash deploy/scripts/migrate.sh` |

## Troubleshooting

- **The UI loads but login fails or calls are blocked.** Re-check
  `PUBLIC_APP_URL`, `ENGENTY_CORS_ORIGINS`, and the Supabase **Redirect URLs** —
  they must all match your real domain.
- **The app can't reach the database.** `SUPABASE_URL` must be reachable from
  inside the containers. A URL that works in your browser is not always routable
  from the Docker network — put Supabase on the same network or use an internal
  URL.
- **You changed a Supabase key or the app URL and nothing updated.** Those are
  `VITE_*` build-time values — **rebuild** the edge image so they're baked in.
- **The AI service won't respond.** Confirm `AI_GATEWAY_API_KEY` and your LLM
  provider credentials are set on the `engenty-edge` service, and check
  `docker logs -f engenty-ai`.

## Reference

For the underlying compose files and a more terse operator-focused reference,
see `deploy/DEPLOY.md` in the repository.
