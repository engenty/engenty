/** @-mention token after leading whitespace (query is substring after `@` up to cursor). */
export function getMentionQueryAtCursor(
  text: string,
  cursor: number
): { atIndex: number; query: string } | null {
  const safeCursor = Math.max(0, Math.min(cursor, text.length));
  const slice = text.slice(0, safeCursor);
  const at = slice.lastIndexOf("@");
  if (at < 0) {
    return null;
  }
  if (at > 0) {
    const before = slice[at - 1];
    if (before && !/\s/.test(before)) {
      return null;
    }
  }
  const afterAt = slice.slice(at + 1);
  if (afterAt.includes("\n") || /\s/.test(afterAt)) {
    return null;
  }
  return { atIndex: at, query: afterAt };
}

/**
 * Canonical @-mention handle for an agent id (`contacts.manager` →
 * `contacts-manager`). Dots become hyphens so the token stays one
 * whitespace-delimited word in the plain textarea.
 */
export function agentIdToMentionHandle(agentId: string): string {
  return agentId.trim().toLowerCase().replaceAll(".", "-");
}

export interface MentionAgentCandidateInput {
  chat_triggers?: {
    include_in_chat_picker?: boolean;
    is_active?: boolean;
    mention_routing_enabled?: boolean;
  };
  id: string;
  name?: string | null;
}

/**
 * Agents offered in the composer @ picker. Mirrors the agent chooser filters
 * (`is_active` + `include_in_chat_picker`) and also respects
 * `mention_routing_enabled` when present (default true).
 */
export function buildMentionAgentCandidates(
  agents: readonly MentionAgentCandidateInput[]
): Array<{ handle: string; id: string; name: string }> {
  const out: Array<{ handle: string; id: string; name: string }> = [];
  const seenHandles = new Set<string>();
  for (const agent of agents) {
    const id = agent.id?.trim();
    if (!id) {
      continue;
    }
    const triggers = agent.chat_triggers;
    if (triggers) {
      if (triggers.is_active === false) {
        continue;
      }
      if (triggers.include_in_chat_picker === false) {
        continue;
      }
      if (triggers.mention_routing_enabled === false) {
        continue;
      }
    }
    const handle = agentIdToMentionHandle(id);
    if (!handle || seenHandles.has(handle)) {
      continue;
    }
    seenHandles.add(handle);
    out.push({
      handle,
      id,
      name: agent.name?.trim() || id,
    });
  }
  return out.toSorted((a, b) => a.name.localeCompare(b.name));
}

/**
 * If the trimmed message starts with `@handle` matching a candidate (longest handle wins),
 * returns the remainder as `text` and the agent id.
 */
export function stripLeadingMentionToken(
  raw: string,
  candidates: readonly { handle: string; id: string }[]
): { requestedAgentId?: string; text: string } {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("@") || candidates.length === 0) {
    return { text: raw.trim() };
  }
  const afterAt = trimmed.slice(1);
  const sorted = [...candidates].sort(
    (a, b) => b.handle.length - a.handle.length
  );
  for (const c of sorted) {
    const h = c.handle;
    if (!h) {
      continue;
    }
    if (afterAt.length < h.length) {
      continue;
    }
    if (afterAt.slice(0, h.length).toLowerCase() !== h.toLowerCase()) {
      continue;
    }
    const next = afterAt[h.length];
    if (next !== undefined && next !== " " && next !== "\n" && next !== "\t") {
      continue;
    }
    return {
      requestedAgentId: c.id,
      text: afterAt.slice(h.length).trimStart(),
    };
  }
  return { text: raw.trim() };
}
