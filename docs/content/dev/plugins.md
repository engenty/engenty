---
title: Plugins & modules
description: Extend Engenty with your own modules.
---

# Plugins & modules

Engenty features ship as **modules** — self-contained plugins discovered by the
core host at startup.

## The manifest

Every module declares itself with an `engenty.plugin.json` manifest: its id,
capabilities, contributed env, storage buckets, and entry points for UI, AI, and
migrations.

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
