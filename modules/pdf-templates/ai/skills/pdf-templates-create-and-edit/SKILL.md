---
name: pdf-templates-create-and-edit
title: Create and edit PDF templates
description: Create, duplicate, restyle and patch the PDF templates that offers and invoices are printed from — always previewing the markup before saving.
allowed-tools: engenty_tools_search engenty_tool_execute navigate
---

# Create and Edit PDF Templates

A PDF template is what a tenant's offers and invoices are printed from. Getting
it wrong does not fail loudly — it produces a document someone sends to a
client. Preview before you write, every time.

For the markup language itself (elements, Liquid, style keys, available data),
load **pdf-templates-markup-reference**.

## The loop

1. `pdf_templates_list` with `{ "module_key": "offers" }` (or `"invoices"`) —
   this is the entry point. `pdf_templates_get` needs an id you do not have yet.
2. `pdf_templates_get` with `{ "id": "<id>" }` for the full record, including
   `document_template`, `stylesheet_template` and `settings_json`.
3. `pdf_templates_preview` with the markup you intend to save. It renders
   against sample data and returns `rendered_xml`, the `template_data` your
   markup may reference, and `input_schema_json`. **It saves nothing** — call it
   as often as you need.
4. Only once the preview renders: `pdf_templates_create` or
   `pdf_templates_update`.

Skipping step 3 is the one shortcut that is never acceptable here. A Liquid
syntax error or an unknown element surfaces as a broken PDF, and the person who
finds out is the client.

## Reading a template

`document_template` and `stylesheet_template` are `null` when the template
follows the module's built-in default. That is a meaningful state, not missing
data — say "uses the standard layout", and preserve it unless the user asks for
custom markup. To start customizing from the default, preview it first: pass the
default markup you get back from `pdf_templates_get` on the module default
(`{ "module_key": "offers", "use_default": true }`).

## Creating

`pdf_templates_create` takes:

- `module_key` — `"offers"` or `"invoices"`. Not changeable afterwards.
- `name` — what the user picks it by. Make it descriptive.
- `is_default` — **setting this true demotes the module's current default.**
  Ask before doing that; it changes what every new document prints as.
- `document_template` / `stylesheet_template` — the markup, or `null` to inherit
  the module default.
- `settings_json` — colors, typography, margins, letterhead. Copy it from an
  existing template rather than assembling it field by field; every key is
  required and a missing one fails validation.

The usual request is "a template like X but …". Do that by reading X with
`pdf_templates_get`, changing what was asked, and creating with a new `name` —
not by writing markup from scratch.

## Patching

`pdf_templates_update` with `{ "id": "<id>", "patch": { … } }`. Only the fields
inside `patch` change.

- Omit `document_template` / `stylesheet_template` to leave the markup alone.
  Passing `null` is not "leave it" — it resets the template to the module
  default and discards the custom markup.
- Changing only `settings_json` is how you restyle a template (brand colors, a
  different typeface, wider margins) without touching markup at all. Prefer this
  whenever the request is about appearance rather than structure.
- `is_default: true` demotes whichever template currently holds it.

## Deleting

`pdf_templates_delete` is irreversible. Confirm explicitly, and check with
`pdf_templates_list` whether it is the module default first — deleting the
default leaves the module printing the built-in layout.

## After a change

Navigate the user to `/mdl/pdf-templates/settings` so they can see and preview
it themselves. Tell them which template you changed by name, and state plainly
if you changed which one is the default.

## Safety Rules

- Preview before every create and update. No exceptions.
- Never flip `is_default` without asking — it silently changes every future
  document.
- Never claim a template was saved unless the operation returned success.
- When the user asks for a change you cannot preview (a data field you are not
  sure exists), preview with the field in place and read `template_data` in the
  response to check it resolved, rather than guessing from the field name.
