---
title: "@engenty/app-shell"
description: Product app shell — layout frame, primary/secondary navigation, copilot shell slots, and browser-side Agent UI registration.
---

# @engenty/app-shell

`@engenty/app-shell` is the **Engenty product shell** for authenticated apps: primary sidebar rail, module secondary column, topbar breadcrumbs, tenant switcher, copilot layout slots, and the React registry that collects **browser-owned Agent UI state** and **frontend tools** for AG-UI runs.

Generic UI primitives (buttons, tables, breadcrumb trail components, sidebar row primitives) stay in `@engenty/ui-core`. Chat runtime, AG-UI transport, and copilot chrome stay in `@engenty/ai-ui`. Wire contracts stay in `@engenty/ag-ui-bridge`.

## Package layout

Source lives under `packages/app-shell/src/`:

| Area | Path | Purpose |
|------|------|---------|
| **Layout frame** | `components/app-layout/` | `AppLayout`, secondary nav column, mobile sheet, hover/resize hooks |
| **Layout components** | `components/` | `AppSidebar`, `AppTopbar`, tenant switcher, breadcrumb↔nav icon enrichment |
| **Contexts** | `context/` | `CopilotShellProvider`, `AgentUiStateProvider`, secondary nav React context |
| **Hooks** | `hooks/` | Persisted pane widths, secondary nav width (internal `use-media-query` for shell breakpoints) |
| **Navigation** | `lib/navigation.ts` | Build sidebar sections from UI plugin contributions; path matching helpers |
| **Shell utilities** | `lib/` | Secondary-nav hover overlay, keyboard roving, pane width persistence |
| **Types** | `types/` | Shell sidebar config, copilot layout persistence (no `@engenty/ai-ui` import) |
| **Styles** | `styles/engenty-print.css` | Shared print stylesheet (imported from app `index.css`) |

Public exports are re-exported from `packages/app-shell/src/index.ts`. Navigation helpers also ship on a dedicated subpath: `@engenty/app-shell/navigation`.

After layout or registry changes, run:

```bash
pnpm --filter @engenty/app-shell build
pnpm --filter @engenty/app-shell test
```

## Entry points

| Import | Use |
|--------|-----|
| `@engenty/app-shell` | `AppLayout`, copilot shell providers, Agent UI hooks, layout constants, frontend-tool helpers (re-exported from `@engenty/ag-ui-bridge`) |
| `@engenty/app-shell/navigation` | `buildNavigationSections`, `matchesPath`, `getSecondaryNavItems`, `findActiveNavLabel` — without pulling layout components |

Apps mount the shell once (`apps/ui`, `apps/manage`). Modules import hooks and navigation helpers; they do not reimplement the frame.

## Import convention

**App bootstrap** — layout + providers:

```tsx
import {
  AppLayout,
  AgentUiStateProvider,
  CopilotShellProvider,
  ShellSecondaryNavProvider,
} from "@engenty/app-shell";
```

**Module pages** — registration and shell context:

```tsx
import {
  useCopilotShell,
  useRegisterAgentUiSlice,
  useFrontendTool,
  shellSecondaryNavItemProps,
} from "@engenty/app-shell";
import { matchesPath } from "@engenty/app-shell/navigation";
```

**Primitives** — always from ui-core:

```tsx
import { Button, ShellBreadcrumbTrail, SidebarRow } from "@engenty/ui-core";
```

**Copilot / AG-UI runtime** — from ai-ui (never from app-shell):

```tsx
import { EngentyAI, useEngentyAgUiConversation } from "@engenty/ai-ui";
```

Module-specific persisted pane hooks (e.g. inbox message metadata column) belong in the **module** `ui/hooks/`, built on `usePersistedEwResizePaneWidth` from this package.

## When to use which area

| Need | Doc |
|------|-----|
| Boundaries vs ui-core, ai-ui, ag-ui-bridge | [Architecture](./architecture) |
| Secondary nav, topbar, copilot column, hover preview | [Shell layout](./shell-layout) |
| Sidebar sections from plugin contributions | [Navigation](./navigation) |
| `useFrontendTool`, snapshots, dialogs, focus targets | [Agent UI registration](./agent-ui-registration) |

## Related docs

- [Architecture](./architecture) — neighborhood, Turbo cycle rules, folder map
- [Shell layout](./shell-layout) — `AppLayout`, secondary column, animation checklist
- [Navigation](./navigation) — `@engenty/app-shell/navigation` subpath
- [Agent UI registration](./agent-ui-registration) — hooks and snapshot rules
- [Agent UI runtime](../../../docs/dev/agent-ui-runtime.md)
- [@engenty/ui-core layout](../ui-core/layout) — breadcrumb and sidebar primitives
- [@engenty/ai-ui](../ai-ui/README) — copilot and AG-UI client
- [@engenty/ag-ui-bridge](../ag-ui-bridge/README) — wire contracts and tool metadata
- Cursor rule: `.cursor/rules/app-shell-sidebar-animation.mdc`
