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
- `options.isSuperAdmin` / `options.isTenantAdmin` for Settings vs Setup
- `options.canSwitchTenant` — superadmins with more than one tenant get Settings → Tenant
- `t` — i18n translate function for `labelKey` entries

Returns `NavigationSection[]` consumed by `AppLayout` / `AppSidebar`:

| Section | Contents |
|---------|----------|
| Top | Copilot apps + promoted Tasks / Projects |
| Modules | Remaining `section: "modules"` items, sorted like Settings (`PLUGIN_CATEGORIES` then within-category `order`); tenant admins can drag-reorder (persisted as `shell.dock_module_order`) |
| Admin | Admin contributions (Engenty first via `ADMIN_MENU_SORT_RANK_BY_ID`) + fixed Settings and Setup rows. In the compact rail, Engenty is pinned always-visible above Settings; other admin icons expand on hover. |

`applyDockModuleOrder(sections, order)` overlays a tenant-persisted id list on the modules section. Unknown ids are skipped; new modules append in default category order.

**Rearrange UX:** long-press a modules-rail icon → wobble + drag; click outside (or Escape) persists `shell.dock_module_order` and exits. Normal clicks still navigate.

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
- `ShellSidebarConfig` — brand, search, user menu

## Related docs

- [Shell layout](./shell-layout)
- Module menu i18n: `.cursor/rules/module-menu-i18n.mdc`
- UI plugin contributions: `docs/content/dev/plugin-system/` (UI catalog)
