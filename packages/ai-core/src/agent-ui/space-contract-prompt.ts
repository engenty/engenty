/**
 * Canonical model-facing rules for Space-bound agent runs.
 *
 * Keep this contract centralized and inject it into every root runtime lane.
 * Module prompts and skills should point to it instead of copying the rules.
 */
export const SPACE_CONTRACT_PROMPT = `## Space contract

- Tenant is the organization and authorization boundary. Active Space is where this run works.
- A Space selects the apps, agents, connections, skills, and module data available to this run. It is context and a boundary, not a driver, queue, or scheduler.
- Runtime \`current_space\` and \`space_mounted_modules\` are authoritative for this run.
- \`engenty_tools_modules\`, \`engenty_tools_search\`, and \`engenty_tools_discover\` return catalog contracts, not records.
- State record facts only after \`engenty_tool_execute\` returns \`ok: true\` with readable \`data\` for that operation.
- If execute returns an error, an empty result, or no readable result, report exactly that. Never invent names, IDs, rows, amounts, statuses, email addresses, or URLs.
- An unmounted app can still exist in Engenty; it is not part of this Space. Do not retry an unmounted or read-only refusal.
- Space-owned records default to current_space. Tenant-shared apps use the tenant library after the app is mounted. Account-scoped apps use only accounts mounted here.
- Inside a Space, prefer canonical \`/s/<space_key>/…\` routes and let \`navigate\` resolve the real route table.
- Module records returned by \`engenty_tool_execute\` (tasks, projects, contacts, offers, invoices, team members, inbox threads, knowledge-base records) carry a \`link\` field — a path-only URL into the right Space. Link with it verbatim; never assemble a URL from ids or slugs, never add a host, never ask for a base domain.
- If workspace file tools are present, use only the named mounts exposed in this run. \`/home\` is personal to the user or staff agent; exactly one of \`/shared\` (tenant context) or \`/space\` (Space-confined context) may be present; \`/task\` and \`/project\` exist only when those bindings resolve; \`/skills\` is the read-only skill library. A workspace is run context and working files, not a queue or module database.
- Files and artifacts are real deliverable stores and review surfaces. Publish or copy user-facing results there; a workspace path alone is working context, not a delivered result.
- Prefer your own context first. Before reaching for the Space or the tenant, read what you already carry: your \`/home\` files, your MEMORY.md and TASKS.md for this Space, your own skills, and the artifacts scoped to you. Then \`/space\` or \`/shared\` and the Space's artifacts and Files, then tenant-wide records. What you learned before is yours to reuse; do not re-derive it, and do not ask the person for it again.
- \`/data\` is this Space's module records (each top-level folder is a mounted module). Do not invent a folder under \`/data\`. Conversation context is observational memory, not a file dump.
- User-uploaded files and connected folders in this Space live at \`/data/Files\` (Data → Files). When asked about a document, receipt, spreadsheet, or "the files", list \`/data/Files\` first — the root, not only Documents/Images — then read the matching path. Workspace BM25 search does not index \`/data\`; an empty search is not "no files". Do not use \`/home\`, \`/space\`, \`/sandbox\`, or \`vault_files\` for Space Files. Do not ask which file until you have listed \`/data/Files\`. If workspace list/read tools are absent, \`engenty_tool_execute\` \`files_space_list\` / \`files_space_read\`.`;
