---
title: Architecture
description: How the apps, packages, and modules fit together.
---

# Architecture

Engenty is a pnpm + Turbo monorepo composed of **apps**, shared **packages**, and
pluggable **modules**.

## Apps

- **core** — the plugin host and single-origin gateway (Hono). Serves the API and
  proxies the UI, AI, docs, and studio under one origin.
- **ui** — the web client (Vite + React).
- **ai** — the agent runtime (Mastra), exposing `/ai/*` (threads, runs, the agent
  registry, instructions, and tools).
- **docs** — this documentation site (Next.js + Fumadocs).

## Packages

Shared libraries consumed across apps and modules — UI components, the API client,
the plugin SDK, environment handling, and more.

## Modules

Self-contained features described by an `engenty.plugin.json` manifest. A module
can contribute UI routes, AI agents and tools, database migrations, and settings.
The core host discovers and wires them at startup.

## Repo layout

| Path | What it is |
|------|------------|
| `apps/core` | Hono backend, HTTP API and plugin host |
| `apps/ui` | React web frontend |
| `apps/ai` | Agent runtime (Mastra + AG-UI) |
| `apps/docs` | This documentation site |
| `packages/*` | Shared libraries and the plugin SDK |
| `modules/*` | Installable feature modules |
| `deploy/*` | Compose files, deploy wizard, operator reference |
| `scripts/*` | Root dev tooling (DB sync, migrations, Portless, clean, purge) |
| `supabase/*` | Local Postgres + auth config and migrations |
| `test/*`, `e2e/*` | Global Vitest setup; Playwright end-to-end suite |

## Database & hosting

One Postgres/Supabase project backs the whole product, and it is yours: engenty
connects to a database you already run — locally the Supabase CLI stack, on a
server a project you host or a Supabase Cloud project — and never manages one
itself.

Each active module owns its own `supabase/migrations` and storage buckets,
declared in `engenty.plugin.json`. `pnpm engenty generate` composes them into that
one config and migrations tree, and `pnpm engenty db migrate` applies changes.

## Authentication & authorization

[Supabase Auth](https://supabase.com/docs/guides/auth) handles sign-in
(email/password, magic link, OTP), verified server-side in
`apps/core/src/security`. Additional providers (OAuth, SSO) are on the roadmap.

Authorization is a per-tenant role, today `admin` or `member`. Tenant isolation
is enforced at the database layer through Postgres Row Level Security. The roles
are deliberately coarse for now; a more granular permission model is planned.

## i18n

Built on [i18next](https://www.i18next.com/) (`@engenty/i18n`), namespaced per
module — every module ships `en` and `de` locales, enforced by convention.
Language is a persisted user/tenant setting, switchable at runtime.
