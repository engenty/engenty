# UI App Specs

## Purpose

`apps/ui` is the frontend host for Engenty modules and plugins. It provides:
- route registration and rendering
- module/plugin UI composition
- i18n namespace loading for plugin labels
- shared top-level layout and navigation behavior

## UI Component Contract

- Shared UI primitives must come from `@engenty/ui-core`.
- Module/plugin code must not import app-local primitives from `apps/ui/src/components/ui`.
- UI pages should use `usePageConfig` for breadcrumbs and topbar actions.
- Shared module pages follow list/detail/edit routes:
  - `/module/<name>`
  - `/module/<name>/:id`
  - `/module/<name>/:id/edit`

## DRY and Reuse Rules

- Reuse `@engenty/ui-core` components for buttons, cards, dialogs, menus, inputs, and badges.
- Keep app-level components focused on composition and feature behavior, not primitive duplication.
- Keep module labels and menu strings in module-local i18n namespaces.

## Routing and Plugin Integration

- UI plugins are registered through the UI catalog in the app host.
- Module routes should be explicit and stable (no query-param primary edit flow).
- Breadcrumb hierarchy should always begin at the module root route.

## Optimization Notes

- The unused local component duplicates under `apps/ui/src/components/ui` were removed to avoid drift from `@engenty/ui-core`.
- Future UI optimization should prioritize:
  - reducing duplicated list toolbar/filter implementations by extracting shared list toolbar helpers
  - auditing large pages for component extraction when files exceed about 250 lines
  - keeping topbar actions limited to page-critical actions only

## Test and Quality Expectations

- UI tests are run with Vitest from the monorepo root.
- New UI behavior should include targeted tests for route resolution, plugin registration, and core user flows.
- Coverage tracking is enabled from the root test script (`test:coverage`).
