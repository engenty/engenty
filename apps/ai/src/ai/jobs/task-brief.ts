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
  identifier?: unknown;
  status?: unknown;
  title?: unknown;
}

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
