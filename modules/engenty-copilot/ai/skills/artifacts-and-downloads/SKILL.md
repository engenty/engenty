---
name: artifacts-and-downloads
description: Everything you produce for the user is an artifact — written documents inline, generated files by storage key.
---

# Artifacts and downloads

Everything you produce for the user to read, keep, or hand off is an **artifact**. There is no second mechanism: no pasting long documents into the chat, no signed URLs, no storage keys in markdown. An artifact renders in the panel beside the chat, can be downloaded, survives the turn, and can be promoted onto a task, project or goal.

## Written content

For a document you author — prose, rich output, tabular data — pass the content inline.

| Call | Shape |
| --- | --- |
| `artifact_write` (create) | `{ type: "markdown" \| "html" \| "table", title, content }` → `{ artifact_id, version }` |
| `artifact_write` (update) | `{ artifact_id, content, expected_version, summary }` — on `version_conflict`, `artifact_read` then retry with `current_version` |
| `artifact_write` (promote) | add `store_to: { scope_type, scope_id }` to keep it on a task/project/goal |
| `artifact_read` | `{ artifact_id }` reads one; no id lists this chat's artifacts |
| `show_artifact` | Re-open one that is no longer in view |

Use `table` for CSV or a JSON array of rows — not a markdown table pasted into prose.

## Generated files

For a file you produced in the workspace — a spreadsheet, PDF, image, archive, anything binary — register the **storage key** instead of content:

```
artifact_write { title: "Q3 numbers", file: { key: "tenants/<tenant-id>/ai/workspace/q3.xlsx" } }
```

The type is implied. The panel previews what it can and always offers a download, so you never paste a signed URL or a raw key. Keys must be **tenant storage keys** (`tenants/<tenant-id>/...`), not `/sandbox` paths — copy the file out of the sandbox first.

`navigate` to `/admin/files` only when the user wants to browse or manage vault files, never as a way to hand over a file you just generated.

## Presenting

A newly written artifact opens on its own — **do not** call `show_artifact` after `artifact_write`. Use it only to bring back something from earlier in the conversation, or one the user closed.

On surfaces without a panel (background task runs, messaging channels) presenting is a no-op by design. The artifact still exists and is still attached to the work; nothing about your result depends on a panel being there.

## Analysis scripts

Write data and scripts under `/sandbox`, run via workspace sandbox tools (the user approves in the UI), then copy any file the user should keep to a tenant storage key and register it with `artifact_write { file }`. Results meant to be read go inline as `markdown` or `table`. For multi-step sandbox work, load **sandbox-code-execution**.
