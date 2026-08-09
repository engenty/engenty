---
name: pdf-templates-markup-reference
title: PDF template markup reference (xml_liquid_v1)
description: The element set, style model, Liquid usage and available data objects for writing PDF template markup — including the failure modes that render wrong instead of erroring.
allowed-tools: engenty_tools_search engenty_tool_execute
---

# xml_liquid_v1 Markup Reference

A template is two Liquid-rendered strings:

- `document_template` — XML describing the page.
- `stylesheet_template` — a **JSON object** of named styles, itself Liquid-rendered
  so it can read `settings`.

Both are rendered with Liquid first, then parsed. So Liquid tags may appear
anywhere, including inside the stylesheet JSON.

Use with **pdf-templates-create-and-edit** for the workflow. Verify everything
here against a real `pdf_templates_preview` call — this is the engine's shape,
not a given template's content.

## Elements

Only six tags exist. `<Document>` must be the root.

| Element | Attributes | Children |
|---|---|---|
| `Document` | — | `Page` |
| `Page` | `size` (default `A4`), `style` | any |
| `View` | `style`, `break="true"` for a page break | any |
| `Text` | `style` | **text only** |
| `Image` | `style`, `src` | none |
| `Link` | `style`, `href` | text only |

### Two failure modes that do not raise an error

**An unknown element silently becomes a `View`.** `<Colum>`, `<text>`,
`<Table>` — none of these error. They render as an anonymous block, so the
document comes out subtly wrong rather than failing. Element names are
case-sensitive: `<text>` is not `<Text>`.

**`Text` drops child elements.** Only its text content is used. This is wrong:

```xml
<Text style="row">{{ label }} <Text style="bold">{{ value }}</Text></Text>
```

The inner `Text` vanishes and its content is concatenated into the outer one.
Use a `View` as the container instead:

```xml
<View style="row">
  <Text style="label">{{ label }}</Text>
  <Text style="bold">{{ value }}</Text>
</View>
```

Text content is trimmed, so leading and trailing spacing must come from styles.

## Styles

`style` holds **names from the stylesheet**, not inline CSS. Several names are
space-separated and merge left to right:

```xml
<Text style="bodyText text-muted">…</Text>
```

The stylesheet is JSON whose keys are those names and whose values are react-pdf
style objects — flexbox layout, `pt` units, no cascade and no selectors:

```json
{
  "page": {
    "paddingTop": "{{ settings.margins.top }}",
    "fontFamily": "{{ settings.typography.text.family }}",
    "color": "{{ settings.colors.text }}"
  },
  "row": { "flexDirection": "row", "justifyContent": "space-between" },
  "bold": { "fontWeight": 700 }
}
```

There is no inheritance between style names beyond what you compose in the
`style` attribute, and no `class`/`id` selectors. A style name used in markup
but missing from the stylesheet is ignored silently.

## Theming through settings

Read design values from `settings` rather than hard-coding them, so the template
stays editable in the UI and follows the tenant's brand:

- `settings.colors` — `text`, `muted`, `accent`, `secondary`, `lines`, `danger`,
  and `backgrounds.{accent,muted,page}`
- `settings.typography.{title,headlines,text,fixed,small}` — each `{ family,
  size, weight }`
- `settings.base_font_size`, `settings.margins.{top,right,bottom,left}`
- `settings.letterhead.{asset_url,fit,horizontal,vertical}` — `asset_url` is
  null when no letterhead is set, so guard it:
  `{% if settings.letterhead.asset_url %}<Image … />{% endif %}`

Hard-coding a hex color is the most common reason a restyle "does not work":
the user changes the color in settings and the template ignores it.

## Liquid

Standard Liquid: `{{ value }}`, `{% if %}`, `{% for %}`, `{% assign %}`,
filters like `| default: "—"` and `| size`.

```liquid
{% if offer.reference %}<Text style="meta">{{ offer.reference }}</Text>{% endif %}
{% for item in items %}<Text>{{ item.title }}</Text>{% endfor %}
{% assign count = totals.phase_totals | size %}
```

Prefer the pre-formatted fields the module provides (`*_formatted`) over
formatting numbers yourself — they already carry the tenant's currency, locale
and decimal conventions from commercial settings.

## Available data

**Do not guess field names.** Call `pdf_templates_preview` and read
`template_data` in the response — that is the exact object the markup is
rendered against, for that module. `input_schema_json` in the same response
describes its shape.

Offers and invoices templates receive `offer` / `invoice`, `recipient`,
`sender`, `content` (the line-item groups), `totals`, `config`, `settings` and
`theme`. `theme` is the same design values as `settings`, flattened
(`theme.accentColor`, `theme.fonts`, `theme.margins`) — either is fine, but do
not mix conventions within one template.

A field that renders empty is usually a name that does not exist — check it
against `template_data` rather than adding a `| default:` and moving on.

## Working method

1. Get the current markup (`pdf_templates_get`), or the module default via
   `{ "module_key": "offers", "use_default": true }`.
2. Change it.
3. `pdf_templates_preview` with the new markup. Read `rendered_xml` — that is
   what will be printed. Check the elements you added actually appear, and that
   values resolved instead of rendering blank.
4. Save with `pdf_templates_update`.

Because unknown elements and missing styles fail silently, step 3 is the only
thing standing between a small typo and a broken client document.
