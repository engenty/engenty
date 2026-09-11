---
name: document-to-action-items
description: Turn documents into Tasks with cited owners.
license: MIT
author: Ben Barclay (benbarclay), Hermes Agent, adapted for Engenty
allowed-tools: skill_search skill analyze_file engenty_tools_search engenty_tool_execute artifact_write
metadata:
  engenty:
    category: productivity
    origin: hermes-agent skills/productivity/document-to-action-items
---

# Document to action items

Extract obligations, deadlines, and owners from a document, then create **Tasks** — not a local markdown dump.

## When to Use

Contracts, briefs, meeting packs, or "what do we owe from this PDF/docx".

## Procedure

1. Read the document (`analyze_file`, **pdf** / **docx** / **ocr-and-documents** as needed). Quote the line you are acting on.
2. List candidates: owner, due date, verb, source quote. Flag missing owners instead of inventing them.
3. Confirm with the user unless they already asked you to create the tasks.
4. Create via catalog ops: `engenty_tools_search` → `engenty_tool_execute` with `tasks_create` (and `tasks_update` if you must amend). Use the Space's task tools, not a `.md` todo file on disk.
5. Report the created task ids.

## Pitfalls

- Writing `TODO.md` in `/home` and calling it done.
- Assigning work to people who are not in the document or the Space.
- Creating tasks before the user asked, on a document that was only a summary request.
