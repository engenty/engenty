---
name: pptx
description: Create and inspect PowerPoint decks; register the file as an artifact.
license: MIT
author: Engenty
allowed-tools: skill_search skill analyze_file mastra_workspace_execute_command artifact_write
metadata:
  engenty:
    category: productivity
    origin: original
---

# Pptx

Create or inspect `.pptx` decks. Deliver the file through Files +
`artifact_write`, not a sandbox path in chat.

This is an Engenty playbook. Do not vendor presentation CLIs that are not on
PATH.

## When to Use

A slide deck the user asked for, or edits to a `.pptx` they provided. Not for
HTML artifacts, Apps, or PDF reports — those are **artifacts-and-downloads**,
**app-authoring**, and **pdf**.

## Procedure

1. Locate an existing deck (workspace `/home`, Space files, or a download
   tool). Try `analyze_file` for a summary or extract before writing code.
2. To create or edit, use sandbox Python with `python-pptx` if it is installed;
   otherwise use whatever presentation library is actually present. Do not
   invent a CLI that is not on PATH.
3. Write the output under `/sandbox`, copy it into tenant storage, then
   `artifact_write { title, file: { key } }`.
4. Keep slides sparse: one idea per slide, readable type, no purple-gradient
   title templates. Charts belong as native shapes or a rendered image you
   generated — not a screenshot of an HTML artifact unless the user asked for
   that.

## Pitfalls

- Returning `/sandbox/...` instead of an artifact the user can download.
- Treating `.ppt` as `.pptx`.
- Embedding remote fonts or CDNs; the file must stand alone.
- Building a tenant App when the ask was a deck.
