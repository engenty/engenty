---
name: canvas-design
description: Posters and visual art as PNG, PDF, or self-contained HTML with bundled fonts.
license: Apache-2.0
author: Anthropic, PBC, adapted for Engenty
allowed-tools: skill_search skill mastra_workspace_execute_command artifact_write
metadata:
  engenty:
    category: design
    origin: anthropics/skills skills/canvas-design
---

# Canvas design

Use this for a **poster, print, or art object** — visual-first, sparse text.
Not for a document, a deck, or a runnable App. Those are **pdf**, **pptx**,
**artifacts-and-downloads**, and **app-authoring**.

This body is adapted for Engenty from Anthropic canvas-design (Apache-2.0).
Do not copy existing artists. Original composition only.

## Surfaces

| Deliverable | How fonts get in |
| --- | --- |
| PNG or PDF | Load TTF from the skill folder in sandbox (file path). |
| HTML artifact or App iframe | **Package into the document**: `@font-face` with a `data:font/ttf;base64,…` URL. |

The preview iframe uses `font-src data:` and `default-src 'none'`. A
`<link>` to Google Fonts, a CDN, or `/skills/…/Foo.ttf` will not load. Copying
the file next to the HTML does nothing unless you also inline it.

After seed, faces live at `/skills/managed/canvas-design/canvas-fonts/`
(OFL text beside each family). Copy the TTF into `/sandbox` if the renderer
cannot read `/skills`. Inventory: `references/fonts.md`.

## Procedure

1. Name a short visual philosophy (movement + how space, color, type, and
   rhythm work). Write it as a markdown artifact. Keep text sparse in the art.
2. Deduce one quiet conceptual thread from the request — felt, not labelled.
3. Pick **two** faces from `canvas-fonts/` that fit the philosophy. Do not
   default to Inter or a purple-gradient template.
4. Draw one page (more only if asked). Prefer repeating marks, limited palette,
   contained margins, no overlaps. Type is a visual element, often thin.
5. **PNG/PDF:** sandbox Python (Pillow, reportlab, cairo — whatever is
   actually installed) with the TTF path. Register with
   `artifact_write { title, file: { key } }`.
6. **HTML:** read the TTF bytes, base64-encode, inline `@font-face` in
   `artifact_write { type: "html", title, content }`. System fonts are the
   fallback, not the look.
7. Second pass: refine what is already there. Do not add more decoration.

## Pitfalls

- Linking a font URL from the skill mount or the web.
- Treating a poster as an App (`app_build`) or a slide deck.
- Returning a sandbox path instead of an artifact.
