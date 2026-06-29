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

More detail on each layer is being added.
