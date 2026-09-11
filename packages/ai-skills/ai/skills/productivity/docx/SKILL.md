---
name: docx
description: Create, read, and edit Word .docx documents.
license: MIT
author: Nous Research, adapted for Engenty
allowed-tools: skill_search skill analyze_file mastra_workspace_execute_command artifact_write
metadata:
  engenty:
    category: productivity
    origin: hermes-agent skills/productivity/docx
---

# Docx

Create, read, and lightly edit Word `.docx` files.

## When to Use

Drafts, templates, commenting on a document the user uploaded. Not for Google Docs or `.doc` binaries.

## Procedure

1. Inspect with `analyze_file` when you only need text or a summary.
2. For structured create/edit, use sandbox Python (`python-docx` or equivalent). Save under `/sandbox` and `artifact_write` the file.
3. Preserve the user's headings and tone. Do not silently convert to markdown-only unless they asked.

## Pitfalls

- Overwriting tracked changes or comments you have not mentioned.
- Assuming Hermes docx CLIs exist in this workspace.
- Pasting the whole document into chat instead of an artifact.
