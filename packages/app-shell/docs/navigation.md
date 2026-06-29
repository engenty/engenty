---
title: Navigation
description: Sidebar section builders and path matching via @engenty/app-shell/navigation.
---

# Navigation

Navigation helpers build the **primary sidebar** from UI plugin contributions and match routes for active states and secondary nav.

Import from the dedicated subpath so list pages and sidebars do not pull layout components:

```ts
import {
  buildNavigationSections,
  matchesPath,
  getSecondaryNavItems,
  findActiveNavLabel,
} from "@engenty/app-shell/navigation";
```

The subpath re-exports `packages/app-shell/src/lib/navigation.ts` via `src/navigation.ts`.

## `buildNavigationSections`

Called during app bootstrap (e.g. `apps/ui` authenticated bootstrap) with:

- `UiContributions` from the UI plugin catalog (`adminMenuItems`, `copilotApps`, `settingsItems`)
- `options.isSuperAdmin` for feature-flag settings link
- `t` — i18n translate function for `labelKey` entries

Returns `NavigationSection[]` consumed by `AppLayout` / `AppSidebar`:

| Section | Contents |
|---------|----------|
| Top | Dashboard + copilot app entries |
| Modules | `section: "modules"` admin menu contributions |
| Admin | Admin contributions + fixed Settings and Plugins rows |

Admin contribution order uses stable **`id` ranks** (`ADMIN_MENU_SORT_RANK_BY_ID`) so dev session cache does not reorder the rail incorrectly.

## Path matching

| Function | Role |
|----------|------|
| `matchesPath(pathname, search, to)` | Active link for sidebar and secondary items (query-aware where configured) |
| `getSecondaryNavItems(pathname, search, sections)` | Role links for the current module parent |
| `findActiveNavLabel(pathname, search, sections)` | Fallback topbar title when page provides no breadcrumbs |

Modules use `matchesPath` in custom secondary nav (KB trees, favorites) alongside `shellSecondaryNavItemProps`.

## Types

Exported from the main entry (`types/shell.ts`):

- `NavigationItem` — `to`, `label`, `icon`, optional `children`, `external`
- `NavigationSection` — optional `label`, `items[]`
- `ShellSidebarConfig` — tenant switcher, brand, plan label
- `ShellTenant`, `TenantSwitcherConfig`

## Related docs

- [Shell layout](./shell-layout)
- Module menu i18n: `.cursor/rules/module-menu-i18n.mdc`
- UI plugin contributions: `docs/content/dev/plugin-system/` (UI catalog)
