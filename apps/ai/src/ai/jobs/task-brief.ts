// Render a Task into the brief a specialist receives as its opening message.
//
// One shape only: the work item somebody assigned to this specialist. Inputs
// the specialist reads come from the Task itself (Paperclip model): title +
// description + linked contexts + prior comments. Kept deliberately plain —
// the specialist's own tools fetch live detail; this is the framing.

import { TASK_SELF_TOOLS_GUIDANCE } from "../../../ai/tools/task-self-tools.js";

export interface TaskBriefSource {
  comments?: Array<{
    content?: unknown;
    created_by_agent_type_key?: unknown;
  }>;
  contexts?: Array<{ context_type?: unknown; context_id?: unknown }>;
  description?: unknown;
  identifier?: unknown;
  status?: unknown;
  title?: unknown;
}

/**
 * What this run IS, stated once. Without it a specialist reaches for the "ask
 * the user…" habits its skills are written around — and the skills are right,
 * for chat. Here nobody is watching: the ask tools say so when called, but by
 * then the turn has already been spent planning around a question that will
 * never be answered.
 */
const UNATTENDED_RUN_CONTRACT = `## This run is unattended
No human is watching this run and nothing you display is seen. Do not ask
questions in your reply, wait for input, or hand back a plan for approval —
decide from the task, its comments and your tools. Presenting things (artifacts,
objects) still works and is still worth doing — the artifact is attached to the
work — but a panel opening is never part of your result.

If something genuinely blocks you and only a person can unblock it, end your
final message with:
- \`TASK_BLOCKED: <the one thing you need, and from whom>\`

That parks the task and puts your question in front of a human, who answers on
the task and re-runs it. Use it for a real blocker, not for a preference you can
decide yourself — a blocked task does no work until someone comes back to it.`;

/** Files/outputs guidance attached to every task job (tools are always mounted). */
const WORKSPACE_GUIDANCE = `## Workspace & outputs
- Durable deliverables (documents, reports, tables) → \`artifact_write\`; they appear on the task and its project with no extra step.
- Run context and working files → the workspace file tools (\`mastra_workspace_write_file\`, \`mastra_workspace_read_file\`, \`mastra_workspace_list_files\`). Write under \`/task\` when the run is task-bound, otherwise your own \`/home\`. \`/routine\` and \`/project\` appear only when bound; \`/space\` is the space's shared folder and \`/shared\` the tenant's.
- \`/data\` is mounted module records, never workspace scratch or a notebook. User-uploaded files in this Space are at \`/data/Files\` — list that root before concluding there are none. Workspace search does not index \`/data\`.
- If you have a sandbox, write a script to a file and run it there rather than doing large data work by hand — that is what it is for.
- Before reporting completion, verify the deliverable actually exists — re-query what you created (record, artifact, file). If the core deliverable could not be produced, report the failure honestly instead of completing.`;

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function buildTaskBrief(task: TaskBriefSource): string {
  const lines: string[] = [];
  const identifier = str(task.identifier);
  const title = str(task.title) || "(untitled task)";
  lines.push(`# Task${identifier ? ` ${identifier}` : ""}: ${title}`);

  const description = str(task.description);
  if (description) {
    lines.push("", "## Description", description);
  }

  const contexts = (task.contexts ?? [])
    .map((c) => `- ${str(c.context_type)}: ${str(c.context_id)}`.trim())
    .filter((line) => line !== "-" && line !== "- :");
  if (contexts.length > 0) {
    lines.push("", "## Linked context", ...contexts);
  }

  const comments = (task.comments ?? [])
    .map((c) => {
      const who = str(c.created_by_agent_type_key) || "user";
      const content = str(c.content);
      return content ? `- **${who}:** ${content}` : "";
    })
    .filter(Boolean);
  if (comments.length > 0) {
    lines.push("", "## Prior comments", ...comments);
  }

  lines.push("", UNATTENDED_RUN_CONTRACT);
  // The task is the run's output channel, so the brief says how to speak on it.
  lines.push("", TASK_SELF_TOOLS_GUIDANCE, "", WORKSPACE_GUIDANCE);

  lines.push(
    "",
    "Complete this task using your tools. When you are done, reply with a concise summary of what you did and the outcome — that summary is recorded as your result on the task.",
    "",
    // The result comment is what a human reads when approving the work, so
    // every record touched must be openable from it. The UI turns this exact
    // form into a link to the record; a bare id renders as unclickable text.
    "Whenever your summary mentions a record you created or changed, write its reference as `<module>:<entity>:<id>` (for example `contacts:contact:0198…`) instead of a bare id. Those references become links the reviewer can open."
  );
  return lines.join("\n");
}
