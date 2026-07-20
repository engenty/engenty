---
title: Module packaging
description: How Engenty modules are packaged, published, and installed from the registry (Level A).
---

# Module packaging (Level A)

Level A lets the app be **composed from modules installed via the registry**
(`node_modules`), not only from workspace `modules/`. It keeps compile-time
linking — no runtime loading — but decouples a module's release and CI from the
platform.

## The module artifact (A1)

Each module under `modules/` is a self-contained, `pnpm pack`-able package. A
per-module `.npmignore` ships the module's **source** (`src/`, `ui/`, `ai/`,
loose root files) plus `dist/`, `engenty.plugin.json`, and
`supabase/migrations/`, trimming only test/dev noise.

Shipping source is deliberate: the platform loads a module's **server + AI face
from source via jiti at runtime** (`apps/core` resolves `./src/plugin.ts` and
`jiti()`s it; `defineModuleAi` reads `ai/agents` + `ai/skills` by path). A
build-only package would silently drop the entire AI face.

## Installing from the registry (A3)

Mark a module as registry-sourced in the root `engenty.plugins`:

```jsonc
"tasks": { "source": "registry" }
// package name defaults to @engenty/<slug>; override with:
"pdf-templates": { "source": "registry", "package": "@engenty/pdf-templates-module" }
```

`resolveEnabledModules` then resolves the module from
`node_modules/<packageName>` instead of `modules/`. Everything downstream
follows automatically — the UI catalog imports it via its package export, its
`ui/` source is registered as a Tailwind `@source`, its migrations aggregate,
and the core loader discovers and loads it exactly like a workspace module
(shadowing any leftover `modules/<slug>` checkout).

## Publishing (A5)

Modules publish to **GitHub Packages** under the `@engenty` scope via the
`Publish module packages` workflow on a release tag. The model is **modules as
overlays**: a published module is installed on top of a running platform that
already provides the internal `@engenty/*` packages, so `scripts/publish-modules.mjs`
rewrites those to `peerDependencies` (host-provided) at publish time while
keeping third-party deps as real dependencies. The committed `package.json` is
never mutated — the transform runs against a staged copy.

Real publishing is gated (safe by default):

- `on: push: tags: ["v*"]` triggers the workflow, but it **dry-runs** unless the
  repo variable `PUBLISH_PACKAGES_ENABLED == 'true'` (mirrors
  `COOLIFY_DEPLOY_ENABLED`). Flip it on when ready:
  ```bash
  gh variable set PUBLISH_PACKAGES_ENABLED -R engenty/engenty-pro --body true
  ```
- `workflow_dispatch` always dry-runs.
- Published version = the tag (lockstep with the platform).

### Consuming a published module

A consumer (e.g. a tenant box) maps the scope to GitHub Packages and installs:

```
# .npmrc
@engenty:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

```bash
pnpm add @engenty/tasks
# then mark it registry-sourced in engenty.plugins and run setup + migrate
```

> The repo root intentionally has **no** `@engenty:registry` `.npmrc` — that
> would make the monorepo's own install resolve workspace packages from the
> registry. The scope mapping belongs in the consumer's environment only.
