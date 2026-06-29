// Render an Action invocation into the opening message its specialist receives.
// The action's `prompt` (ACTION.md body) is the task; the input + subject binding
// are appended so the agent knows what it's operating on. Mirrors task-brief.ts.

export interface ActionBriefSource {
  context_id?: string | null;
  context_type?: string | null;
  input?: Record<string, unknown>;
  prompt: string;
}

export function buildActionBrief(action: ActionBriefSource): string {
  const lines: string[] = [action.prompt.trim()];

  const ctxType = (action.context_type ?? "").trim();
  const ctxId = (action.context_id ?? "").trim();
  if (ctxType && ctxId) {
    lines.push("", "## Subject", `- ${ctxType}: ${ctxId}`);
  }

  const input = action.input ?? {};
  if (Object.keys(input).length > 0) {
    lines.push(
      "",
      "## Input",
      "```json",
      JSON.stringify(input, null, 2),
      "```"
    );
  }

  return lines.join("\n");
}
