---
title: Settings forms
description: SettingsFormSection, SettingsFormRow, and SettingsFormCard for stacked settings pages.
---

# Settings forms

`admin/settings/` provides the stacked settings block pattern used on tenant settings, module settings, and appearance pages: section title and description, optional note, then controls inside a single bordered form card.

## Exports

| Export | Role |
|--------|------|
| `SettingsFormSection` | Title + description + `SettingsFormCard` wrapper |
| `SettingsFormCard` | Bordered settings surface (`default` or `compact` variant) |
| `SettingsFormRow` | Label + control grid row for settings fields |
| `SettingsFieldsHeaderRow` / `SettingsFieldsDataRow` | Multi-column editable field grids |
| `SettingsFieldsInset`, `SettingsFieldsRowEndSlot` | Layout helpers for dense field tables |

## Basic section

```tsx
import { SettingsFormSection, SettingsFormRow } from "@engenty/ui-core";

<SettingsFormSection
  title={t("sections.general")}
  description={t("sections.generalDesc")}
  note={optionalCallout}
>
  <SettingsFormRow label={t("fields.name")}>
    <Input value={name} onChange={…} />
  </SettingsFormRow>
</SettingsFormSection>
```

Use `cardVariant="compact"` with `cardClassName="space-y-0 divide-y divide-border"` when stacking multiple `SettingsFormRow`s.

## Rules

- **One card surface per section** — `SettingsFormSection` already renders `SettingsFormCard`. Do not nest another `Card` inside `children` (double borders and padding).
- **Tables on the form card** — render `<Table>` directly as children; do not wrap it in an inner `Card`.
- **Title + description spacing** — the section component wraps intro copy in one block so Tailwind `space-y-*` does not add extra gap between title and description.

## Card variant comparison

| Surface | When |
|---------|------|
| `SettingsFormSection` + `SettingsFormCard` | Settings and admin form pages |
| `Card variant="form"` | General edit forms (module detail/edit routes) |
| `Card variant="default"` | Standalone panels and list surrounds |
| `Card variant="panel"` | Sections on `bg-background` inside scroll shells |

See `.cursor/rules/settings-form-section-ui.mdc` for anti-patterns and narrow-column layout notes.

## Source

`packages/ui-core/src/components/admin/settings/`
