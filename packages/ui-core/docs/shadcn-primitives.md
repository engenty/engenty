---
title: shadcn primitives
description: How shadcn components are installed and exported from packages/ui-core/src/components/ui.
---

# shadcn primitives

The `src/components/ui/` folder holds shadcn/Radix primitives shared across Engenty. This tree is CLI-managed; deeper per-component docs live in the [shadcn registry](https://ui.shadcn.com/docs/components).

## Configuration

| File | Role |
|------|------|
| `packages/ui-core/components.json` | shadcn aliases and Tailwind paths |
| `packages/ui-core/tsconfig.json` | `@engenty/ui-core/*` → `./src/*` |
| `packages/ui-core/src/index.css` | CSS entry for the package |

Hand-written files under `ui/` should use **relative** imports between neighbors. Do not use `@/` inside ui-core (reserved for `apps/ui`).

## Add or update components

```bash
cd packages/ui-core
pnpm dlx shadcn@latest add button
pnpm dlx shadcn@latest add dialog dropdown-menu tabs
```

After each add:

1. Export public symbols from `packages/ui-core/src/index.ts`.
2. Run `pnpm check:ui-core-imports` from the repo root.
3. Run `pnpm --filter @engenty/ui-core build`.

## Card variants

`Card` supports product-specific variants used across admin and settings:

| Variant | Use |
|---------|-----|
| `default` | Bordered list/panel surfaces |
| `form` | General form blocks on edit pages |
| `panel` | Sections on `bg-background` without outer padding (pair with explicit header/content padding) |

`SettingsFormCard` (used by `SettingsFormSection`) is the bordered settings surface — do not nest another `Card` inside it.

## Higher-level components

Product-specific building blocks live **outside** `ui/`:

- `admin/` — list, list-preferences, settings
- `layout/` — shell and sidebar
- `layout/` — shell and sidebar

Import those from their documented areas, not by reaching into `ui/` for patterns that already have a named export.
