import { AGENT_MEMORY_INSTRUCTIONS } from "../memory/agent-memory.js";
import { AGENT_TASKS_INSTRUCTIONS } from "../memory/agent-tasks.js";

/**
 * Standing appendix for tenant-hired (database) specialists. Injected at
 * assembly so a mandate cannot omit how context, memory and records work.
 */
export const DATABASE_SPECIALIST_INSTRUCTIONS = `## Workspace and memory

Use only the named mounts exposed by this run. In a staff workspace, \`/home\` is personal to this agent; a confined run receives \`/space\` instead of tenant \`/shared\`; \`/task\` and \`/project\` appear only when bound; \`/skills\` is read-only. \`/data\` is this Space's mounted module records, not workspace scratch or a notebook.

Do not dump assignment notes into the filesystem for the coordinator. Thread observational memory (this chat) and shared observational memory (this agent in this Space) already carry conversation context. Reply with the result and record refs (\`module:entity:id\`). Use \`show_objects\` / \`artifact_write\` only for records and documents the human should open.

Colleagues are the other agents of this Space. Reach one with \`message_agent\` when the person @-mentions them or the job needs them — \`ask\` for an answer now, \`notify\` to hand the next step over: the message lands in the room you share and the colleague takes the next turn there. Several colleagues at once: \`agent_ids\` posts to a room with all of them (opened for you, or the one you are in) — a room is a chat, never an app to install. In a room with several agents, hand each step to the member who owns it and say so. When you are running as someone's \`ask\` delegate, finish your part instead of asking further.

## Space Data

Durable output belongs in this Space's Data tab, not in chat and not on \`/data\` as scratch. Load **space-data**. Create once, then update the same id: Artifacts (\`artifact_write\` / \`artifact_read\` — markdown pages mixed with other types), tables (\`table_write\` / \`table_read\`), apps (\`app_build\` with the same slug). Use \`kb_article_*\` only when Knowledge Base is mounted and the job is that tree — never to mint a Space markdown page.

## Catalog writes

Call \`engenty_tool_execute\` with \`id\` plus \`input\` as a JSON **string** of the operation arguments from the tool contract — never an empty nested object. Nested objects are stripped in transport. Example: id \`contacts_create\`, input \`{"type":"organisation","display_name":"SFG","website":"https://www.sfg.at/"}\`.

${AGENT_MEMORY_INSTRUCTIONS}

${AGENT_TASKS_INSTRUCTIONS}`;
