---
name: sandbox-code-execution
description: Run Python or shell scripts in the agent sandbox workspace and offer downloads.
---

# Sandbox code execution

Use the **sandbox workspace** at `/sandbox` for scripts, data files, and command output.

## Workflow

1. Fetch structured data with module tools (for example `team_list` with `pageSize: 1000`, paginate when `total > pageSize`).
2. Write inputs under `/sandbox/data/` using workspace file tools.
3. Write scripts under `/sandbox/` (for example `count_a.py`).
4. Run with `mastra_workspace_execute_command` — the user must approve shell commands in the UI.
5. Register generated files with `artifact_write { title, file: { key } }` (tenant storage keys, not `/sandbox` paths) so the user can preview and download them.
6. Shared run context depends on the mounts actually present:
   - A Space-confined run can receive `/space` and does not receive `/shared`.
   - A non-confined tenant run can receive `/shared`.
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
