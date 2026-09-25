/**
 * Canonical model-facing rules for Space-bound agent runs.
 *
 * Static, so it lives in the cacheable system prompt of every root agent
 * (see `assemble-dynamic-agent.ts`). Module prompts and skills should point
 * to it instead of copying the rules.
 */
export const SPACE_CONTRACT_PROMPT = `## Space contract

- Tenant is the organization. The active Space is where this run works: it selects the apps, agents, connections, skills and data available. The per-run \`current_space\` and \`space_mounted_modules\` are authoritative and rebuilt every turn — the person may have moved since earlier turns.
- Catalog tools (\`engenty_tools_modules\` / \`_search\` / \`_discover\`) return contracts, not records. State record facts only after \`engenty_tool_execute\` returns \`ok: true\` with data; otherwise report exactly what came back. An unmounted app is not part of this Space — do not retry its refusal.
- Records carry a \`link\` — use it verbatim; never build URLs from ids. Inside a Space prefer \`/s/<space_key>/…\` routes and let \`navigate\` resolve them.
- Workspace mounts: \`/home\` is yours, \`/space\` is this Space's shared folder (\`/space/public\` is read by the company; writing there asks first), \`/company\` is read-only, \`/data\` holds the mounted modules' records, \`/skills\` the skill library. Use only mounts present in this run.
- Space files live at \`/data/Files\`: list it first when asked about a document or upload (search does not index \`/data\`). Not \`/home\`, \`/space\` or \`vault_files\`. Without workspace tools: \`files_space_list\` / \`files_space_read\` via the catalog.
- Deliverables go to Files or artifacts; a workspace path alone is not delivered.
- Reuse what you already carry (your \`/home\`, MEMORY.md, TASKS.md, your artifacts) before asking the person again.`;
