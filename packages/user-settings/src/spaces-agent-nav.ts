import { z } from "zod";

/**
 * Per-user Work-tab agent pins and unpinned order (`shell.spaces.agent_nav.v1`).
 *
 * Personal nav, not a mount grant — same rationale as `spaces-recent.ts` vs
 * org-wide dock order. Pinning an Engenty for you must not reorder everyone
 * else's sidebar, and must not live on `core.space_mount`.
 */
export const SPACES_AGENT_NAV_SETTING_KEY = "shell.spaces.agent_nav.v1";

export const SPACES_AGENT_NAV_MAX_PINNED = 40;
export const SPACES_AGENT_NAV_MAX_ORDER = 200;

export const spacesAgentNavSpaceSchema = z.object({
  order: z.array(z.string().min(1)).max(SPACES_AGENT_NAV_MAX_ORDER),
  pinned: z.array(z.string().min(1)).max(SPACES_AGENT_NAV_MAX_PINNED),
});

export const spacesAgentNavDocumentSchema = z.object({
  spaces: z.record(z.string().min(1), spacesAgentNavSpaceSchema),
  v: z.literal(1),
});

export type SpacesAgentNavSpace = z.infer<typeof spacesAgentNavSpaceSchema>;
export type SpacesAgentNavDocument = z.infer<
  typeof spacesAgentNavDocumentSchema
>;

export function emptySpacesAgentNavDocument(): SpacesAgentNavDocument {
  return { spaces: {}, v: 1 };
}

export function emptySpacesAgentNavSpace(): SpacesAgentNavSpace {
  return { order: [], pinned: [] };
}

/**
 * Tolerant read: anything that does not parse becomes `null`, and callers fall
 * back to an empty doc. A user-settings document survives across releases, so a
 * shape change must degrade to "no pins" rather than throw in the sidebar.
 */
export function parseSpacesAgentNavDocument(
  value: unknown
): SpacesAgentNavDocument | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const parsed = spacesAgentNavDocumentSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function agentNavForSpace(
  doc: SpacesAgentNavDocument,
  spaceId: string
): SpacesAgentNavSpace {
  return doc.spaces[spaceId] ?? emptySpacesAgentNavSpace();
}

function writeSpace(
  doc: SpacesAgentNavDocument,
  spaceId: string,
  slice: SpacesAgentNavSpace
): SpacesAgentNavDocument {
  const id = spaceId.trim();
  if (!id) {
    return doc;
  }
  return {
    spaces: { ...doc.spaces, [id]: slice },
    v: 1,
  };
}

function uniqueIds(ids: readonly string[], max: number): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const id of ids) {
    const trimmed = id.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    next.push(trimmed);
    if (next.length >= max) {
      break;
    }
  }
  return next;
}

/** Drop ids that are no longer on the roster; pinned ids never also sit in order. */
export function pruneSpacesAgentNav(
  doc: SpacesAgentNavDocument,
  spaceId: string,
  rosterIds: readonly string[]
): SpacesAgentNavDocument {
  const allowed = new Set(
    rosterIds.map((id) => id.trim()).filter((id) => id.length > 0)
  );
  const slice = agentNavForSpace(doc, spaceId);
  const pinned = uniqueIds(
    slice.pinned.filter((id) => allowed.has(id)),
    SPACES_AGENT_NAV_MAX_PINNED
  );
  const pinnedSet = new Set(pinned);
  const order = uniqueIds(
    slice.order.filter((id) => allowed.has(id) && !pinnedSet.has(id)),
    SPACES_AGENT_NAV_MAX_ORDER
  );
  if (
    pinned.length === slice.pinned.length &&
    order.length === slice.order.length &&
    pinned.every((id, index) => id === slice.pinned[index]) &&
    order.every((id, index) => id === slice.order[index])
  ) {
    return doc;
  }
  return writeSpace(doc, spaceId, { order, pinned });
}

export function pinSpaceAgent(
  doc: SpacesAgentNavDocument,
  spaceId: string,
  agentId: string
): SpacesAgentNavDocument {
  const id = agentId.trim();
  if (!id) {
    return doc;
  }
  const slice = agentNavForSpace(doc, spaceId);
  if (slice.pinned.includes(id)) {
    return doc;
  }
  return writeSpace(doc, spaceId, {
    order: slice.order.filter((item) => item !== id),
    pinned: uniqueIds([...slice.pinned, id], SPACES_AGENT_NAV_MAX_PINNED),
  });
}

export function unpinSpaceAgent(
  doc: SpacesAgentNavDocument,
  spaceId: string,
  agentId: string
): SpacesAgentNavDocument {
  const id = agentId.trim();
  if (!id) {
    return doc;
  }
  const slice = agentNavForSpace(doc, spaceId);
  if (!slice.pinned.includes(id)) {
    return doc;
  }
  const pinned = slice.pinned.filter((item) => item !== id);
  const order = slice.order.includes(id)
    ? slice.order
    : uniqueIds([...slice.order, id], SPACES_AGENT_NAV_MAX_ORDER);
  return writeSpace(doc, spaceId, { order, pinned });
}

export function setSpaceAgentPinnedOrder(
  doc: SpacesAgentNavDocument,
  spaceId: string,
  pinnedIds: readonly string[]
): SpacesAgentNavDocument {
  const slice = agentNavForSpace(doc, spaceId);
  const pinned = uniqueIds(pinnedIds, SPACES_AGENT_NAV_MAX_PINNED);
  const pinnedSet = new Set(pinned);
  return writeSpace(doc, spaceId, {
    order: slice.order.filter((id) => !pinnedSet.has(id)),
    pinned,
  });
}

export function setSpaceAgentUnpinnedOrder(
  doc: SpacesAgentNavDocument,
  spaceId: string,
  orderIds: readonly string[]
): SpacesAgentNavDocument {
  const slice = agentNavForSpace(doc, spaceId);
  const pinnedSet = new Set(slice.pinned);
  return writeSpace(doc, spaceId, {
    order: uniqueIds(
      orderIds.filter((id) => !pinnedSet.has(id)),
      SPACES_AGENT_NAV_MAX_ORDER
    ),
    pinned: slice.pinned,
  });
}
