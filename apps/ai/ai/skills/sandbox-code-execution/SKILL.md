---
name: sandbox-code-execution
description: Run shell commands and Python/Node scripts on the Space's computer — only when the person asked for technical work (code, scripts, data processing, a CLI).
---

# Sandbox code execution

Load this only when the person asked for technical work: code, a script, data
processing, file conversion, or a CLI. It brings the shell tool, and every
command you run is shown to the person as raw shell for approval.

Never for business work a tool already does: records, Apps, agents and
settings go through the catalog; today's date and time are in your run
context; web research goes through `web_search` / `web_fetch`.

Use the **sandbox workspace** at `/sandbox` for scripts, data files, and command output.

Space uploads the user already stored are **not** here. They live at
`/data/Files`. List and read that path with workspace file tools; do not copy
the tree into `/sandbox` to look something up.

## Workflow

1. Fetch structured data with module tools (for example `team_list` with `pageSize: 1000`, paginate when `total > pageSize`).
2. Write inputs under `/sandbox/data/` using workspace file tools.
3. Write scripts under `/sandbox/` (for example `count_a.py`).
4. Run with `mastra_workspace_execute_command`. Say in one line what the command does before you run it.
5. Register generated files with `artifact_write { title, file: { key } }` (tenant storage keys, not `/sandbox` paths) so the user can preview and download them.
6. Shared run context: `/space` is this Space's working folder (read-write).
   `/company` is read-only — `/company/files` is the company drive and
   `/company/spaces/<key>/` what each Space published, `/company/apps/<slug>/`
   the source of those Spaces' Apps. Writing to
   `/space/public` publishes to the whole company and asks the person first;
   the company drive is written only through `company_files_publish`.
   These mounts hold reusable working context, not module records or the final
   delivery surface. Publish user-facing files to durable Files/storage and
   register them as artifacts. Treat concurrent writes as last-writer-wins and
   prefer unique filenames.

## Team member tasks

- Tool: `team_list` — fields `first_name`, `last_name`.
- Paginate until all members are loaded.
- Prefer `/sandbox` over `/home` for ephemeral analysis scripts.

## Notes

- `mastra_workspace_execute_command` takes a single `command` string (a full shell command line, e.g. `python3 count_a.py`), with optional `cwd`. The working directory is the `/sandbox` mount root, so prefer paths relative to `/sandbox` (or pass `cwd: "/sandbox"`).
- Commands run in an isolated workspace directory synced to tenant file storage. The sandbox is keyed per chat session, so files you write persist across the approve/resume step and within the conversation.
- **Local dev:** `ENGENTY_SANDBOX_PROVIDER=local` (default) or `docker` when Docker Engine is available (`ENGENTY_SANDBOX_DOCKER_IMAGE` optional, default `node:22-slim`).
- **Production VPS:** `ENGENTY_SANDBOX_PROVIDER=docker` (container isolation via `@mastra/docker`).

## Installs and sign-ins

- System paths are read-only and there is no sudo: install into `$HOME` or
  `/sandbox` (`npx`, `uvx`, a project's `npm install` or `uv venv`), never
  `npm install -g`. On a Space computer installs stay for the Space's other
  agents; say what you installed. Package caches are warm per Space.
- Skills and MCP servers an installer writes reach no one until offered: call
  `computer_skills_find` and `connector_import_request` after it runs.
- A CLI that signs in through a browser (`<cli> login`): run it with
  `background: true`, then call `browser_sign_in` with the URL it prints.
- Only inside a script that already runs and must loop over many records:
  `engenty tools call <id> --input '<json>'` reaches the same operations as
  `engenty_tool_execute`. Never to look up or discover tools. Exit 2 means the
  write needs approval: call `engenty_tools_preapprove`, then run it again.
