---
name: artifacts-and-downloads
description: Prefer live artifacts for readable docs; use offer_file_downloads only for files the user must save or hand off.
---

# Artifacts and downloads

## Artifacts (prefer for readable deliverables)

When you generate a **document the user will read, review, or iterate on** — markdown notes, HTML, or tabular data (CSV / JSON row array) — create an **artifact**. Do not write a sandbox file and offer a download for this. Artifacts render in the artifact panel beside the chat and stay editable across turns.

| Tool | Role |
| --- | --- |
| `artifact_write` (create) | `{ type: "markdown" \| "html" \| "table", title, content }` → `{ artifact_id, version }`; panel opens |
| `artifact_write` (update) | `{ artifact_id, content, expected_version, summary }` — on `version_conflict`, `artifact_read` then retry with `current_version` |
| `artifact_write` (store) | add `store_to: { scope_type, scope_id }` to keep it on a task/project/goal |
| `artifact_read` | `{ artifact_id }` reads one; no id lists this chat's artifacts |
| `show_artifact` | Frontend — bring an artifact back into view |

Prefer an artifact over pasting a long document into chat, and over sandbox-write + `offer_file_downloads`, whenever the deliverable is meant to be **seen, read, or edited in the app**.

## File downloads

Reserve `offer_file_downloads` for files the user needs to **save or hand off** — binaries, spreadsheets for Excel, generated images/assets, archives — **not** readable documents you can render as an artifact.

When you create or update such files in the agent workspace (tenant storage keys, often under `ai/workspace/...`) and the user should download them, call `offer_file_downloads` with `files` as one or more `{ key, name?, mime_type? }`. Keys must be **tenant storage keys** (`tenants/<tenant-id>/...`), not raw `/sandbox` paths. The chat UI renders download buttons — do not paste signed URLs or storage keys in markdown.

Use `navigate` to `/admin/files` only when the user wants to browse or manage vault files (Files module under the admin shell), not for a simple download of files you just generated.

## Analysis scripts

Write data and scripts under `/sandbox`, run via workspace sandbox tools (user approves in UI), then either render the result as an artifact or, for files to save, copy to a tenant storage key and `offer_file_downloads`. For multi-step sandbox work, load **sandbox-code-execution**.
