// Render a Task into the brief a specialist receives as its opening message.
// Inputs the specialist reads come from the Task itself (Paperclip model):
// title + description + linked contexts + prior comments. Kept deliberately
// plain — the specialist's own tools fetch live detail; this is the framing.

export interface TaskBriefSource {
  comments?: Array<{
    content?: unknown;
    created_by_agent_type_key?: unknown;
  }>;
  contexts?: Array<{ context_type?: unknown; context_id?: unknown }>;
  description?: unknown;
  /** Goal this task belongs to — drives the "## Goal context" section. */
  goal_id?: unknown;
  /** Open sibling task titles under the same goal (capped by the caller). */
  goal_sibling_titles?: unknown;
  goal_status?: unknown;
  goal_title?: unknown;
  identifier?: unknown;
  /** Optional routine workspace storage prefix for the brief section. */
  routine_workspace_prefix?: unknown;
  status?: unknown;
  title?: unknown;
  /** When set, this task is the standing host of a schedule routine. */
  trigger_id?: unknown;
}

/** Files/outputs guidance attached to every task job (tools are always mounted). */
const WORKSPACE_GUIDANCE = `## Workspace & outputs
- Durable deliverables (documents, notes, tables) → \`artifact_create\` — they appear on the task and its goal/project with no extra step.
- Working files, scratch, and state the next run should find → \`workspace_write_file\` / \`workspace_read_file\` / \`workspace_list_files\`. A relative path (e.g. \`notes.md\`) resolves into your task workspace; the goal (when linked), routine (when linked), and shared commons folders are also reachable via their full \`tenants/…\` keys.`;

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Standing routine tasks only keep the newest comments in the brief. */
export const ROUTINE_BRIEF_COMMENT_CAP = 10;

const ROUTINE_RUN_PROTOCOL = `## Routine run protocol
This task is the standing host of a recurring routine. This run is one cycle:
check state (comments below, your routine workspace, prior learnings), decide
whether anything needs doing, do small work inline. For substantial work, create
a dedicated task instead of extending this run.
End your final message with exactly one of:
- \`ROUTINE_OK\` alone — nothing notable happened; the run is logged silently.
- \`ROUTINE_REVIEW: <one line why>\` — a human should look at this run's result.
- a normal report (neither token, or substantive text that ends with \`ROUTINE_OK\` — trailing OK is stripped, still a report).`;

export function buildTaskBrief(task: TaskBriefSource): string {
  const lines: string[] = [];
  const identifier = str(task.identifier);
  const title = str(task.title) || "(untitled task)";
  const isRoutine = Boolean(str(task.trigger_id));
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

  const goalTitle = str(task.goal_title);
  if (str(task.goal_id) && goalTitle) {
    const goalStatus = str(task.goal_status);
    lines.push(
      "",
      "## Goal context",
      `Goal: ${goalTitle}${goalStatus ? ` (${goalStatus})` : ""}`
    );
    const siblings = Array.isArray(task.goal_sibling_titles)
      ? task.goal_sibling_titles.map((t) => str(t)).filter(Boolean)
      : [];
    if (siblings.length > 0) {
      lines.push(
        "Open sibling tasks:",
        ...siblings.map((title) => `- ${title}`)
      );
    }
  }

  const allComments = (task.comments ?? [])
    .map((c) => {
      const who = str(c.created_by_agent_type_key) || "user";
      const content = str(c.content);
      return content ? `- **${who}:** ${content}` : "";
    })
    .filter(Boolean);
  // Standing routine tasks live forever — cap brief growth; older history
  // lives on the task page / routine memory.
  const comments = isRoutine
    ? allComments.slice(-ROUTINE_BRIEF_COMMENT_CAP)
    : allComments;
  if (comments.length > 0) {
    lines.push("", "## Prior comments", ...comments);
    if (isRoutine && allComments.length > comments.length) {
      lines.push(
        "",
        "_Older history: task page / routine memory (not shown here)._"
      );
    }
  }

  const routineWorkspace = str(task.routine_workspace_prefix);
  if (isRoutine && routineWorkspace) {
    lines.push(
      "",
      "## Routine workspace",
      `Durable folder across runs: \`${routineWorkspace}\`. Read state left by previous runs; write what the next run should find. Use workspace_read_file / workspace_write_file with paths under this prefix (or the task workspace).`
    );
  }

  if (isRoutine) {
    lines.push("", ROUTINE_RUN_PROTOCOL);
  } else {
    lines.push("", WORKSPACE_GUIDANCE);
    lines.push(
      "",
      "Complete this task using your tools. When you are done, reply with a concise summary of what you did and the outcome — that summary is recorded as your result on the task.",
      "",
      // The result comment is what a human reads when approving the work, so
      // every record touched must be openable from it. The UI turns this exact
      // form into a link to the record; a bare id renders as unclickable text.
      "Whenever your summary mentions a record you created or changed, write its reference as `<module>:<entity>:<id>` (for example `contacts:contact:0198…`) instead of a bare id. Those references become links the reviewer can open."
    );
  }
  return lines.join("\n");
}
