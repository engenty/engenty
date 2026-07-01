# Agent context (vendor-neutral)

**Canonical home** for coding-agent rules in this repo. Edit files here — not tool-specific wrappers.

## How each tool loads context

| Tool | Always-on entry | On-demand rules |
|------|-----------------|-----------------|
| **Any agent** | [AGENTS.md](../../AGENTS.md) | [rules/](./rules/) — read the file that matches your task |
| **Cursor** | AGENTS.md (project rule) | `.cursor/rules/*.mdc` — symlinks to `docs/agent/rules/` |

## Rule index

| Rule | When to load |
|------|----------------|
| [design-system.mdc](./rules/design-system.mdc) | Visual UI — read [DESIGN.md](../../DESIGN.md) first |
| [list-detail-edit-ui-conventions.mdc](./rules/list-detail-edit-ui-conventions.mdc) | Module list/detail/edit routes, tables, filters |
| [ui-components.mdc](./rules/ui-components.mdc) | shadcn / `@engenty/ui-core`, Card variants, plugin routes |
| [settings-form-section-ui.mdc](./rules/settings-form-section-ui.mdc) | Settings blocks with title + form card |
| [header-tabs-ui.mdc](./rules/header-tabs-ui.mdc) | Full-width header with line tabs |
| [edit-screen-design.mdc](./rules/edit-screen-design.mdc) | Edit/detail page layout |
| [sidebar-ui-spacing.mdc](./rules/sidebar-ui-spacing.mdc) | Secondary sidebar spacing |
| [app-shell-sidebar-animation.mdc](./rules/app-shell-sidebar-animation.mdc) | Collapsible sidebar animation |
| [module-menu-i18n.mdc](./rules/module-menu-i18n.mdc) | Module menu `labelKey` / locales |
| [module-migrations.mdc](./rules/module-migrations.mdc) | DB migrations in modules |
| [ai-gateway.mdc](./rules/ai-gateway.mdc) | Mastra models, `AI_GATEWAY_API_KEY` |
| [ai-elements.mdc](./rules/ai-elements.mdc) | Chat UI in `@engenty/ai-ui` |
| [ai-core-docs.mdc](./rules/ai-core-docs.mdc) | Keep `packages/ai-core` docs in sync |
| [roadmap.mdc](./rules/roadmap.mdc) | Add items to `docs/content/roadmap/` |

## Maintenance

- **Single source:** `docs/agent/rules/*.mdc` (YAML frontmatter + markdown body).
- **Cursor:** `.cursor/rules/` contains symlinks only. Re-create with:

```bash
cd .cursor/rules
for f in ../../docs/agent/rules/*.mdc; do ln -sf "$f" "$(basename "$f")"; done
```

- **DESIGN.md** lives at repo root — visual tokens and shell rules; referenced by `design-system.mdc`.
