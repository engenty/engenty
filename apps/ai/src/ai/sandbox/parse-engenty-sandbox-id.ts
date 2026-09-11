import { isAgentThreadId } from "@engenty/ai-core";

export type EngentySandboxLifecycle =
  | "session"
  | "run"
  | "task"
  | "space"
  | "browser";

export interface ParsedEngentySandboxId {
  /** The agent a `session` sandbox belongs to; null for other lifecycles. */
  agent_id: string | null;
  lifecycle: EngentySandboxLifecycle;
  sandbox_id: string;
  scope_key: string;
  scope_suffix: string;
  /** The space a `space`/`browser` service belongs to; null otherwise. */
  space_id: string | null;
  /** The tenant a `space`/`browser` service belongs to; null otherwise. */
  tenant_id: string | null;
  thread_id: string | null;
  /** The person a `browser` belongs to; null for every other lifecycle. */
  user_id: string | null;
}

const ENGENTY_SANDBOX_ID_PATTERN =
  /^engenty-(session|run|task|space|browser)-([a-zA-Z0-9_.-]+)$/;

// Mastra labels containers with `mastra.sandbox.id` (= `engenty-<scope>`). Session
// lifecycle embeds `<threadId>-<agentId>`; run/task need DB lookup.

/**
 * Split a session suffix into its thread and agent halves.
 *
 * The thread id is a UUID and the agent id may contain dashes and dots, so the
 * split is by the UUID's fixed shape rather than by the last separator.
 */
function splitSessionSuffix(
  suffix: string
): { agentId: string; threadId: string } | null {
  const match = /^([0-9a-fA-F-]{36})-(.+)$/.exec(suffix);
  if (!(match && isAgentThreadId(match[1]))) {
    return null;
  }
  return { agentId: match[2], threadId: match[1] };
}

const UUID_PATTERN_SOURCE =
  "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

// A `space` suffix is `<tenantId>-<spaceId>`, both UUIDs, so the split is by
// their fixed shape — same approach as the session suffix. A `browser` suffix
// carries a third UUID, the user the browser belongs to; a two-UUID browser id
// is a pre-per-user container still on some host, parsed so the catalog can
// show and remove it, never started again.
function splitSpaceSuffix(
  suffix: string
): { spaceId: string; tenantId: string; userId: string | null } | null {
  const match = new RegExp(
    `^(${UUID_PATTERN_SOURCE})-(${UUID_PATTERN_SOURCE})(?:-(${UUID_PATTERN_SOURCE}))?$`
  ).exec(suffix);
  if (!match) {
    return null;
  }
  return { spaceId: match[2], tenantId: match[1], userId: match[3] ?? null };
}
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
  const session =
    lifecycle === "session" ? splitSessionSuffix(scopeSuffix) : null;
  const split =
    lifecycle === "space" || lifecycle === "browser"
      ? splitSpaceSuffix(scopeSuffix)
      : null;
  // A machine id has exactly two UUIDs; a third one is not a machine.
  const space = lifecycle === "space" && split?.userId ? null : split;
  return {
    agent_id: session?.agentId ?? null,
    lifecycle,
    sandbox_id: trimmed,
    scope_key: scopeKey,
    scope_suffix: scopeSuffix,
    space_id: space?.spaceId ?? null,
    tenant_id: space?.tenantId ?? null,
    thread_id: session?.threadId ?? null,
    user_id: lifecycle === "browser" ? (space?.userId ?? null) : null,
  };
}
