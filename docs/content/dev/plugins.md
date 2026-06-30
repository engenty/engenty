---
title: Plugin framework
description: How Engenty modules are declared, discovered, loaded, and extended.
---

# Plugins & Modules

Engenty is a modular framework - to integrate your AI agents with your apps in a unified UI.

The core apps provide a backend (Hono, Supabase), an UI (React) and and an AI / agent backend based on Mastra. This is supported by various feature packages.

To actually do something - you need **modules** - which can be integrated via the **plugin-framework**. 

We ship several base plugins as basic building blocks - so engenty isn't empty. Even some core functioanlities are designed as plugins ( tenant-settings, user-settings ).

The core is **plugin-free**: it never imports a module directly; Instead we use plugin manifests and hooks to load and integrate them at runtime via the Plugin-SDK. This page covers the model, the lifecycle commands, the manifest, and how plugins can extend the core and each other.

For how `engenty setup` turns the manifest into a running stack, see
[Setup process](./setup-process).

## What is a plugin

A **module** is a self-contained feature in its own directory with an `engenty.plugin.json` manifest. Via the plugin-framework it can contribute backend routes and operations, UI routes, menus and widgets, AI agents and tools, database migrations, storage buckets, and environment settings. The core host discovers and loads plugins at startup — it never imports them directly.

Plugins live in two locations:

- **`modules/*`** — first-party feature modules, installed per product.
- **`packages/*`** — platform plugins that ship with the host (for example the context graph and tenant/user settings).

## Plugin lifecycle

A plugin moves through three states:

1. **On disk** — the directory exists in the repo and pnpm sees it as a workspace
   package. The code is present, but nothing runs — no routes, UI, or migrations —
   until the plugin is installed.
2. **Installed** — the plugin is listed in the root **`engenty.plugins`**
   manifest. This is the product declaration: the set of plugins this build
   ships. Installing runs `engenty setup`, which regenerates the **derived
   wiring** from the manifest — aggregated migrations, Supabase config, the UI
   catalog, and the `@engenty/<slug>` dependency in `apps/ui/package.json` for UI
   plugins. These artifacts are generated; never edit them by hand.
3. **Active** — at runtime an installed plugin can be turned on or off, globally
   or per tenant, through the API. Activation is a flag stored in the database and
   takes effect without a rebuild.

**Install vs. activate.** *Install* is build-time: it decides whether a plugin is
part of this build and regenerates its wiring — use it to add or remove a feature
from the product. *Activate* is runtime: it toggles an already-installed plugin
for the whole instance or a single tenant, with no redeploy — use it for
per-tenant feature gating. A plugin must be installed before it can be activated.

```bash
# Install a module that's already in modules/ (writes engenty.plugins + runs setup):
pnpm engenty plugins install <slug>
pnpm db:migrate && pnpm dev

# List plugins (works with the API down; adds live runtime state when it's up):
pnpm engenty plugins list
```

## Lifecycle commands

```bash
pnpm engenty plugins create [name]        # scaffold modules/<slug>/ (manifest + src) — files only
pnpm engenty plugins install [target...]  # in-repo slug or external package spec; --all installs every workspace module
pnpm engenty plugins uninstall <target>   # remove from the product (workspace slug, or external id via the API)
pnpm engenty plugins list                 # list discovered plugins; enriched with live state when the API is up
pnpm engenty plugins check                # validate installed entries exist on disk with a manifest
pnpm engenty plugins activate|deactivate [id]   # runtime toggle, global or per-tenant (requires the API)
```

- **`create`** only writes files — it does not install the plugin. Install it
  afterwards.
- Running **`install`** or **`uninstall`** with no target opens an interactive
  picker (space to toggle, `a` = all / none, `i` = invert, enter to confirm).
- **`install <slug>`** is the in-repo path; **`install <pkg@version>`** installs
  an external package through the core API.

## Plugins-free core (the import boundary)

**The core repo must not statically import a plugin.** A plugin contributes
through `engenty.plugin.json` + the runtime (`engenty.server.*`, registries,
events) — never through a compile-time `import "@engenty/<plugin>"` in
`apps/core`, `apps/ui`, or `apps/ai`, and never via an entry in an app's
`package.json`. That keeps the core build independent of any plugin and lets the
host boot without building plugin `dist/` (plugins load from source via jiti).

When a plugin needs to expose shared services to the host, it **installs a host
provider** at load time and core delegates to it lazily. The context graph works
this way: `@engenty/context-graph` owns its singletons and calls
`engenty.server.registerContextGraphHost(...)`; core holds only the
`@engenty/plugin-sdk` contract.

**Sanctioned exception — mandatory platform plugins.** A small set of plugins are
declared mandatory in `ENGENTY_HOST_MANDATORY_PLUGINS` (`tenant-settings`,
`user-settings`, `engenty-copilot`): always enabled, not user-toggleable. Core
may depend on the **DAL primitives** of mandatory *platform* plugins
(`tenant-settings`, `user-settings`) because they are effectively core
infrastructure. "Plugins-free" means free of *optional / business* plugins —
not free of the mandatory platform substrate. Do not extend this exception to
any other plugin without a deliberate decision.

## The manifest: `engenty.plugin.json`

Every plugin declares itself with an `engenty.plugin.json` at its root:

```jsonc
{
  "id": "hello-world",            // kebab-case; matches the directory name
  "name": "Hello World",
  "version": "0.0.1",
  "kind": "module",               // "module" (modules/*) or "package" (packages/*)
  "provides": ["module.hello-world", "ui.route.module.hello-world"],
  "requires": [],                 // capabilities this plugin needs from others
  "capabilities": { "ui": true, "ai": false, "operations": true },
  "server": { "entry": "src/plugin.ts" },   // backend EngentyPluginFactory
  "ui": { "entry": "@engenty/hello-world/plugin", "load": "workspace" },
  "env": { "feature": { "id": "...", "label": "..." }, "vars": [ /* … */ ] },
  "supabase": { "storageBuckets": [ /* … */ ] }   // migrations live in supabase/migrations/
}
```

- **`provides` / `requires`** drive capability gating and load order.
- **`server.entry`** is the backend factory; **`ui.entry`** is the UI plugin.
- **`env`** contributes feature gates and env vars to the `env` wizard
  (`recommended: true` on a feature pre-checks it on a fresh setup).
- **`supabase/migrations/`** in the plugin are aggregated by `engenty setup`.

## Discovery

The host scans two roots, with different gating:

| Root | Gated by | Use |
|------|----------|-----|
| `modules/*` | the **`engenty.plugins`** manifest — only listed slugs are discovered | First-party / business modules (opt-in) |
| `packages/*` | always discovered | Platform plugins (context-graph, tenant-settings, …) |

**Mandatory plugins** (`ENGENTY_HOST_MANDATORY_PLUGINS`: `engenty-copilot`,
`tenant-settings`, `user-settings`) are force-enabled by the loader. A mandatory
*module* still needs a manifest entry to be discovered; mandatory *packages* load
automatically. Plugins are loaded from source via `jiti`, so they need no build.

## What a module can contribute

- **UI** — routes, navigation entries, widgets, settings entries, and copilot frontend tools.
- **AI** — agents, tools, and instruction documents for the agent runtime.
- **Data** — Supabase migrations and storage buckets, aggregated at sync time.
- **Settings** — environment keys and admin configuration.

## How contributions work: `register*`

A UI module has one entry point — `ui/plugin.ts` — that receives an
`EngentyPluginContext` and **registers** what it adds into core registries:

```ts
export default function plugin(engenty: EngentyPluginContext) {
  engenty.UI.registerRoute({
    id: "hello_world_root",
    path: "/module/hello-world",
    component: HelloWorldPage,
    order: 45,
  });

  engenty.UI.registerAdminMenuItem({
    id: "hello_world_menu",
    section: "modules",
    label: "Hello World",
    to: "/module/hello-world",
    order: 45,
  });
}
```

`plugin()` *is* the init moment — there is no separate "ready" event to wait for.
Every `register*` shares the same contract:

- **Declarative** — you describe *what exists* (a route, a menu item, a tab) as
  plain data + components, not imperative wiring.
- **Idempotent by `id`** — re-registering the same id replaces the entry. Safe
  across hot-reloads and re-runs; never produces duplicates.
- **Ordered by `order`** — position is data, independent of plugin load order.

Core's discovery, activation, tenant gating, and lifecycle then operate on these
registries (see the manifest's `provides` / `requires` for capability gating).

## Custom contribution points

When core doesn't already expose a seam you need, a module can **own one** with
`createContributionRegistry` — the same primitive the built-in `register*`
functions are built on. Use it to let *other* modules extend *your* surface.

```ts
import { createContributionRegistry } from "@engenty/ui-plugin-sdk";

export interface MemberTab {
  id: string;
  order: number;
  label: string;
  urlSuffix: string;
  content?: ComponentType<{ memberId: string }>;
  isVisible?: (ctx: { featureFlags: ResolvedFlags }) => boolean;
}

// Module-singleton registry + a public register function.
export const memberTabRegistry = createContributionRegistry<MemberTab>();
export const registerMemberTab = (tab: MemberTab) => memberTabRegistry.register(tab);
```

Another module contributes from its own `plugin()`:

```ts
registerMemberTab({
  id: "hr",
  order: 2,
  label: "HR",
  urlSuffix: "hr",
  isVisible: ({ featureFlags }) => featureFlags["team.hr.enabled"] === true,
});
```

### Reading a registry in React: `useContributionRegistry`

Contributions can be registered **after** a component first renders (lazy module
init, hot-reload). Reading the registry synchronously during render would miss
those — the late entry silently never appears. Always read through the reactive
hook, which subscribes to the registry and re-renders on registration:

```tsx
import { useContributionRegistry } from "@engenty/ui-plugin-sdk";

function MemberTabs({ featureFlags }: { featureFlags: ResolvedFlags }) {
  const tabs = useContributionRegistry(memberTabRegistry); // re-renders on late register
  const visible = tabs.filter((t) => (t.isVisible ? t.isVisible({ featureFlags }) : true));

  return visible.map((t) => <Tab key={t.id} {...t} />);
}
```

> `useContributionRegistry` is built on `useSyncExternalStore`. Filtering and
> visibility are the consumer's concern — evaluate them at render against live
> context (feature flags, route, tenant), not at registration time.

The registry value is also plain and inspectable, which makes it trivial to test:

```ts
expect(memberTabRegistry.getAll().map((t) => t.id)).toEqual(["work", "hr", "time"]);
```

## Registries vs. events

Engenty also exposes an event runtime (`engenty.events`) for lifecycle signals —
core operation events and module events like
`knowledge-base.inbox.item.created`, emitted/subscribed via
`engenty.events.modules.emit(...)` / `.on(...)`. The two systems model different
things — pick by whether you're declaring a thing or reacting to a moment:

| You are… | Use |
| --- | --- |
| Contributing a thing the UI lists or renders (route, tab, widget, menu item, column) | a registry — `register*` / `createContributionRegistry` |
| Reacting to a moment (`saved`, `navigated`, `applied`) | an event — `engenty.events.modules.on(...)` |
| Transforming a value as it passes through many plugins | a filter/transform chain (or an ordered registry of transformers if you also need to introspect them) |

Rule of thumb: **registries model nouns (what exists), events model verbs (what
happens).** A tab is a noun, so it's a registry entry; "a member was saved" is a
verb, so it's an event. Choosing the registry for contributions also sidesteps a
class of render-timing bugs — the reactive read is the single synchronization
point, instead of every consumer having to decide *when* to collect.
