import { isAgentThreadId } from "@engenty/ai-core";

export type EngentySandboxLifecycle = "session" | "run" | "task";

export interface ParsedEngentySandboxId {
  lifecycle: EngentySandboxLifecycle;
  sandbox_id: string;
  scope_key: string;
  scope_suffix: string;
  thread_id: string | null;
}

const ENGENTY_SANDBOX_ID_PATTERN =
  /^engenty-(session|run|task)-([a-zA-Z0-9_.-]+)$/;

// Mastra labels containers with `mastra.sandbox.id` (= `engenty-<scope>`). Session
// lifecycle embeds the parent thread id directly; run/task need DB lookup.
export function parseEngentySandboxId(
  sandboxId: string
): ParsedEngentySandboxId | null {
  const trimmed = sandboxId.trim();
  const match = ENGENTY_SANDBOX_ID_PATTERN.exec(trimmed);
  if (!match) {
    return null;
  }
  const lifecycle = match[1] as EngentySandboxLifecycle;
  const scopeSuffix = match[2];
  const scopeKey = `${lifecycle}-${scopeSuffix}`;
  const threadId =
    lifecycle === "session" && isAgentThreadId(scopeSuffix)
      ? scopeSuffix
      : null;
  return {
    lifecycle,
    sandbox_id: trimmed,
    scope_key: scopeKey,
    scope_suffix: scopeSuffix,
    thread_id: threadId,
  };
}
