import { z } from "zod";

/**
 * Per-user sidebar organisation of a Space's conversations
 * (`shell.spaces.conversation_nav.v1`).
 *
 * Every sidebar row is a conversation: an agent's desk or a thread (a room or a
 * DM). One person files those rows into personal sections above the three
 * built-in ones, pins favourites, orders rows by hand inside a section and
 * hides rows until they have something new to say. All of it is one person's
 * view of one Space — none of it grants or restricts who may read a thread.
 */
export const SPACES_CONVERSATION_NAV_SETTING_KEY =
  "shell.spaces.conversation_nav.v1";

export const SPACES_CONVERSATION_NAV_MAX_SECTIONS = 20;
export const SPACES_CONVERSATION_NAV_MAX_PINNED = 40;
export const SPACES_CONVERSATION_NAV_MAX_ITEM_ORDER = 200;

/** Built-in sections, in their default order: Agenten · Räume · Direktnachrichten. */
export const BUILT_IN_SECTION_IDS = ["agents", "rooms", "dms"] as const;
export type BuiltInSectionId = (typeof BUILT_IN_SECTION_IDS)[number];

export type ConversationItemKind = "agent" | "thread";
/** A sidebar row: an agent's desk (`agent:<agentId>`) or a thread (`thread:<threadId>`). */
export type ConversationNavItem = `agent:${string}` | `thread:${string}`;

const CONVERSATION_ITEM_PATTERN = /^(agent|thread):(.+)$/;

export function isConversationNavItem(
  value: unknown
): value is ConversationNavItem {
  return typeof value === "string" && CONVERSATION_ITEM_PATTERN.test(value);
}

export function conversationItemKey(
  kind: ConversationItemKind,
  id: string
): ConversationNavItem {
  return `${kind}:${id}`;
}

export function parseConversationItem(
  item: string
): { kind: ConversationItemKind; id: string } | null {
  const match = CONVERSATION_ITEM_PATTERN.exec(item);
  if (!match) {
    return null;
  }
  return { id: match[2] ?? "", kind: match[1] as ConversationItemKind };
}

export function isBuiltInSectionId(id: string): id is BuiltInSectionId {
  return (BUILT_IN_SECTION_IDS as readonly string[]).includes(id);
}

export const conversationNavItemSchema = z.custom<ConversationNavItem>(
  isConversationNavItem,
  "expected agent:<id> or thread:<id>"
);

export const conversationNavSectionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

export const spacesConversationNavSpaceSchema = z.object({
  /** item → ISO timestamp of when it was hidden; see `isConversationHidden`. */
  hidden: z.record(conversationNavItemSchema, z.string().min(1)),
  /** Manual order inside one section; items missing here sort by activity. */
  itemOrder: z.record(
    z.string().min(1),
    z
      .array(conversationNavItemSchema)
      .max(SPACES_CONVERSATION_NAV_MAX_ITEM_ORDER)
  ),
  /** Section order — personal ids and built-in ids alike. */
  order: z.array(z.string().min(1)),
  /** Favoriten, in order. */
  pinned: z
    .array(conversationNavItemSchema)
    .max(SPACES_CONVERSATION_NAV_MAX_PINNED),
  /**
   * item → section id. An item without a placement belongs to the built-in
   * section of its kind; the caller decides which one that is.
   */
  placement: z.record(conversationNavItemSchema, z.string().min(1)),
  /** Personal sections. Their order lives in `order`, not here. */
  sections: z
    .array(conversationNavSectionSchema)
    .max(SPACES_CONVERSATION_NAV_MAX_SECTIONS),
});

export const spacesConversationNavDocumentSchema = z.object({
  spaces: z.record(z.string().min(1), spacesConversationNavSpaceSchema),
  v: z.literal(1),
});

export type ConversationNavSection = z.infer<
  typeof conversationNavSectionSchema
>;
export type SpacesConversationNavSpace = z.infer<
  typeof spacesConversationNavSpaceSchema
>;
export type SpacesConversationNavDocument = z.infer<
  typeof spacesConversationNavDocumentSchema
>;

export function emptySpacesConversationNavDocument(): SpacesConversationNavDocument {
  return { spaces: {}, v: 1 };
}

export function emptySpacesConversationNavSpace(): SpacesConversationNavSpace {
  return {
    hidden: {},
    itemOrder: {},
    order: [],
    pinned: [],
    placement: {},
    sections: [],
  };
}

/**
 * Tolerant read: anything that does not parse becomes `null`, and callers fall
 * back to an empty doc. A user-settings document survives across releases, so a
 * shape change must degrade to "no sections, no pins" rather than throw in the
 * sidebar.
 */
export function parseSpacesConversationNavDocument(
  value: unknown
): SpacesConversationNavDocument | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const parsed = spacesConversationNavDocumentSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Built-ins the stored order does not name yet, appended in their default order. */
function completeSectionOrder(order: readonly string[]): string[] {
  const missing = BUILT_IN_SECTION_IDS.filter((id) => !order.includes(id));
  return missing.length === 0 ? [...order] : [...order, ...missing];
}

/** The stored slice, untouched — the same object across reads. */
function storedSlice(
  doc: SpacesConversationNavDocument,
  spaceId: string
): SpacesConversationNavSpace {
  return doc.spaces[spaceId] ?? emptySpacesConversationNavSpace();
}

/**
 * The slice for one Space with `order` completed: built-ins the user never
 * touched are appended in their default order, so callers can render sections
 * straight from `order`.
 */
export function conversationNavForSpace(
  doc: SpacesConversationNavDocument,
  spaceId: string
): SpacesConversationNavSpace {
  const slice = storedSlice(doc, spaceId);
  if (BUILT_IN_SECTION_IDS.every((id) => slice.order.includes(id))) {
    return slice;
  }
  return { ...slice, order: completeSectionOrder(slice.order) };
}

function writeSpace(
  doc: SpacesConversationNavDocument,
  spaceId: string,
  slice: SpacesConversationNavSpace
): SpacesConversationNavDocument {
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

function uniqueItems(
  items: readonly string[],
  max: number
): ConversationNavItem[] {
  return uniqueIds(items, max).filter(isConversationNavItem);
}

function normalizeItem(item: string): ConversationNavItem | null {
  const trimmed = item.trim();
  return isConversationNavItem(trimmed) ? trimmed : null;
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/** Keeps the entries `keep` accepts; returns the same object when nothing was dropped. */
function filterRecord<K extends string, V>(
  record: Record<K, V>,
  keep: (key: K, value: V) => boolean
): Record<K, V> {
  const next = {} as Record<K, V>;
  let changed = false;
  for (const key of Object.keys(record) as K[]) {
    const value = record[key];
    if (keep(key, value)) {
      next[key] = value;
    } else {
      changed = true;
    }
  }
  return changed ? next : record;
}

/** Drops `items` from every list; returns the same object when none was listed. */
function withoutItemsInOrder(
  itemOrder: SpacesConversationNavSpace["itemOrder"],
  items: ReadonlySet<string>
): SpacesConversationNavSpace["itemOrder"] {
  let changed = false;
  const next: SpacesConversationNavSpace["itemOrder"] = {};
  for (const [sectionId, list] of Object.entries(itemOrder)) {
    const filtered = list.filter((item) => !items.has(item));
    changed = changed || filtered.length !== list.length;
    next[sectionId] = filtered;
  }
  return changed ? next : itemOrder;
}

function personalSectionIds(slice: SpacesConversationNavSpace): Set<string> {
  return new Set(slice.sections.map((section) => section.id));
}

function isKnownSectionId(
  slice: SpacesConversationNavSpace,
  sectionId: string
): boolean {
  return (
    isBuiltInSectionId(sectionId) || personalSectionIds(slice).has(sectionId)
  );
}

/** Pinning moves the row to Favoriten, so it leaves every manual section order. */
export function pinConversation(
  doc: SpacesConversationNavDocument,
  spaceId: string,
  item: string
): SpacesConversationNavDocument {
  const key = normalizeItem(item);
  if (!key) {
    return doc;
  }
  const slice = storedSlice(doc, spaceId);
  if (slice.pinned.includes(key)) {
    return doc;
  }
  const pinned = uniqueItems(
    [...slice.pinned, key],
    SPACES_CONVERSATION_NAV_MAX_PINNED
  );
  if (!pinned.includes(key)) {
    return doc;
  }
  return writeSpace(doc, spaceId, {
    ...slice,
    itemOrder: withoutItemsInOrder(slice.itemOrder, new Set([key])),
    pinned,
  });
}

/**
 * Unpinning returns the row to its placement (or the built-in of its kind). It
 * gets no manual position back; the section's activity sort decides.
 */
export function unpinConversation(
  doc: SpacesConversationNavDocument,
  spaceId: string,
  item: string
): SpacesConversationNavDocument {
  const key = normalizeItem(item);
  if (!key) {
    return doc;
  }
  const slice = storedSlice(doc, spaceId);
  if (!slice.pinned.includes(key)) {
    return doc;
  }
  return writeSpace(doc, spaceId, {
    ...slice,
    pinned: slice.pinned.filter((pinned) => pinned !== key),
  });
}

/**
 * Files a row into a section; `null` clears the placement so the row returns
 * to the built-in of its kind. Either way the row leaves every manual order —
 * a position in the old section means nothing in the new one. A pinned row
 * stays pinned: the placement is where it lands once unpinned. Filing into a
 * section that does not exist is a no-op.
 */
export function placeConversation(
  doc: SpacesConversationNavDocument,
  spaceId: string,
  item: string,
  sectionId: string | null
): SpacesConversationNavDocument {
  const key = normalizeItem(item);
  if (!key) {
    return doc;
  }
  const slice = storedSlice(doc, spaceId);
  const target = sectionId?.trim() || null;
  if (target && !isKnownSectionId(slice, target)) {
    return doc;
  }
  const current = slice.placement[key];
  if ((current ?? null) === target) {
    return doc;
  }
  const placement = target
    ? { ...slice.placement, [key]: target }
    : filterRecord(slice.placement, (placed) => placed !== key);
  return writeSpace(doc, spaceId, {
    ...slice,
    itemOrder: withoutItemsInOrder(slice.itemOrder, new Set([key])),
    placement,
  });
}

/** Hides a row until it has a message newer than `hiddenAtIso`. */
export function hideConversation(
  doc: SpacesConversationNavDocument,
  spaceId: string,
  item: string,
  hiddenAtIso: string
): SpacesConversationNavDocument {
  const key = normalizeItem(item);
  const hiddenAt = hiddenAtIso.trim();
  if (!(key && hiddenAt)) {
    return doc;
  }
  const slice = storedSlice(doc, spaceId);
  if (slice.hidden[key] === hiddenAt) {
    return doc;
  }
  return writeSpace(doc, spaceId, {
    ...slice,
    hidden: { ...slice.hidden, [key]: hiddenAt },
  });
}

export function unhideConversation(
  doc: SpacesConversationNavDocument,
  spaceId: string,
  item: string
): SpacesConversationNavDocument {
  const key = normalizeItem(item);
  if (!key) {
    return doc;
  }
  const slice = storedSlice(doc, spaceId);
  if (!(key in slice.hidden)) {
    return doc;
  }
  return writeSpace(doc, spaceId, {
    ...slice,
    hidden: filterRecord(slice.hidden, (hidden) => hidden !== key),
  });
}

/**
 * A hidden row stays hidden while its `updated_at` is at or before the moment
 * it was hidden; the next message brings it back. Both sides are ISO 8601
 * timestamps: they compare as instants when both parse, and as strings
 * otherwise (ISO strings of one precision and zone sort lexicographically).
 */
export function isConversationHidden(
  slice: SpacesConversationNavSpace,
  item: string,
  updatedAtIso: string | null | undefined
): boolean {
  const key = normalizeItem(item);
  if (!key) {
    return false;
  }
  const hiddenAt = slice.hidden[key];
  if (!hiddenAt) {
    return false;
  }
  if (!updatedAtIso) {
    return true;
  }
  const hiddenMs = Date.parse(hiddenAt);
  const updatedMs = Date.parse(updatedAtIso);
  if (Number.isFinite(hiddenMs) && Number.isFinite(updatedMs)) {
    return updatedMs <= hiddenMs;
  }
  return updatedAtIso <= hiddenAt;
}

/**
 * Adds a personal section. It goes above the built-ins: into `order` right
 * before the first built-in id. Empty names, ids already in use and built-in
 * ids are rejected, as is the 21st section.
 */
export function createConversationSection(
  doc: SpacesConversationNavDocument,
  spaceId: string,
  section: { id: string; name: string }
): SpacesConversationNavDocument {
  const id = section.id.trim();
  const name = section.name.trim();
  if (!(id && name) || isBuiltInSectionId(id)) {
    return doc;
  }
  const slice = storedSlice(doc, spaceId);
  if (
    personalSectionIds(slice).has(id) ||
    slice.sections.length >= SPACES_CONVERSATION_NAV_MAX_SECTIONS
  ) {
    return doc;
  }
  const order = completeSectionOrder(slice.order).filter(
    (sectionId) => sectionId !== id
  );
  const firstBuiltIn = order.findIndex(isBuiltInSectionId);
  order.splice(firstBuiltIn, 0, id);
  return writeSpace(doc, spaceId, {
    ...slice,
    order,
    sections: [...slice.sections, { id, name }],
  });
}

/** Built-in sections keep their names; renaming one is a no-op. */
export function renameConversationSection(
  doc: SpacesConversationNavDocument,
  spaceId: string,
  sectionId: string,
  name: string
): SpacesConversationNavDocument {
  const id = sectionId.trim();
  const nextName = name.trim();
  if (!(id && nextName) || isBuiltInSectionId(id)) {
    return doc;
  }
  const slice = storedSlice(doc, spaceId);
  const existing = slice.sections.find((section) => section.id === id);
  if (!existing || existing.name === nextName) {
    return doc;
  }
  return writeSpace(doc, spaceId, {
    ...slice,
    sections: slice.sections.map((section) =>
      section.id === id ? { id, name: nextName } : section
    ),
  });
}

/**
 * Removes a personal section; the rows filed there return to the built-in of
 * their kind. Built-ins cannot be deleted.
 */
export function deleteConversationSection(
  doc: SpacesConversationNavDocument,
  spaceId: string,
  sectionId: string
): SpacesConversationNavDocument {
  const id = sectionId.trim();
  if (!id || isBuiltInSectionId(id)) {
    return doc;
  }
  const slice = storedSlice(doc, spaceId);
  if (!personalSectionIds(slice).has(id)) {
    return doc;
  }
  return writeSpace(doc, spaceId, {
    ...slice,
    itemOrder: filterRecord(slice.itemOrder, (key) => key !== id),
    order: slice.order.filter((key) => key !== id),
    placement: filterRecord(slice.placement, (_item, placed) => placed !== id),
    sections: slice.sections.filter((section) => section.id !== id),
  });
}

/**
 * Sets the section order. Ids that are neither built-in nor a personal section
 * are dropped; built-ins left out are appended in their default order, then
 * personal sections left out in their previous relative order.
 */
export function setConversationSectionOrder(
  doc: SpacesConversationNavDocument,
  spaceId: string,
  sectionIds: readonly string[]
): SpacesConversationNavDocument {
  const slice = storedSlice(doc, spaceId);
  const personal = personalSectionIds(slice);
  const order = uniqueIds(sectionIds, Number.POSITIVE_INFINITY).filter(
    (id) => isBuiltInSectionId(id) || personal.has(id)
  );
  const previous = completeSectionOrder(slice.order);
  const missingPersonal = [
    ...previous.filter((id) => personal.has(id)),
    ...slice.sections.map((section) => section.id),
  ];
  for (const id of [...BUILT_IN_SECTION_IDS, ...missingPersonal]) {
    if (!order.includes(id)) {
      order.push(id);
    }
  }
  if (sameList(order, slice.order)) {
    return doc;
  }
  return writeSpace(doc, spaceId, { ...slice, order });
}

/**
 * Sets the manual order inside one section. Pinned rows are not in any section
 * and are dropped; an empty list removes the manual order so activity sorts
 * the section again.
 */
export function setConversationItemOrder(
  doc: SpacesConversationNavDocument,
  spaceId: string,
  sectionId: string,
  items: readonly string[]
): SpacesConversationNavDocument {
  const id = sectionId.trim();
  const slice = storedSlice(doc, spaceId);
  if (!(id && isKnownSectionId(slice, id))) {
    return doc;
  }
  const pinned = new Set<string>(slice.pinned);
  const list = uniqueItems(
    items.filter((item) => !pinned.has(item.trim())),
    SPACES_CONVERSATION_NAV_MAX_ITEM_ORDER
  );
  const current = slice.itemOrder[id];
  if (current ? sameList(list, current) : list.length === 0) {
    return doc;
  }
  const itemOrder =
    list.length === 0
      ? filterRecord(slice.itemOrder, (key) => key !== id)
      : { ...slice.itemOrder, [id]: list };
  return writeSpace(doc, spaceId, { ...slice, itemOrder });
}

/** Sets Favoriten in full; anything newly pinned leaves the manual section orders. */
export function setPinnedConversationOrder(
  doc: SpacesConversationNavDocument,
  spaceId: string,
  items: readonly string[]
): SpacesConversationNavDocument {
  const slice = storedSlice(doc, spaceId);
  const pinned = uniqueItems(items, SPACES_CONVERSATION_NAV_MAX_PINNED);
  const itemOrder = withoutItemsInOrder(slice.itemOrder, new Set(pinned));
  if (sameList(pinned, slice.pinned) && itemOrder === slice.itemOrder) {
    return doc;
  }
  return writeSpace(doc, spaceId, { ...slice, itemOrder, pinned });
}

/**
 * Forgets rows that no longer exist for this person — an agent unmounted, a
 * room archived or left. Sections survive; only their contents are pruned.
 */
export function pruneSpacesConversationNav(
  doc: SpacesConversationNavDocument,
  spaceId: string,
  knownItems: readonly ConversationNavItem[]
): SpacesConversationNavDocument {
  const known = new Set<string>(knownItems);
  const slice = storedSlice(doc, spaceId);
  const pinned = slice.pinned.filter((item) => known.has(item));
  let itemOrderChanged = false;
  const itemOrder: SpacesConversationNavSpace["itemOrder"] = {};
  for (const [sectionId, list] of Object.entries(slice.itemOrder)) {
    const kept = list.filter((item) => known.has(item));
    itemOrderChanged = itemOrderChanged || kept.length !== list.length;
    itemOrder[sectionId] = kept;
  }
  const placement = filterRecord(slice.placement, (item) => known.has(item));
  const hidden = filterRecord(slice.hidden, (item) => known.has(item));
  if (
    pinned.length === slice.pinned.length &&
    !itemOrderChanged &&
    placement === slice.placement &&
    hidden === slice.hidden
  ) {
    return doc;
  }
  return writeSpace(doc, spaceId, {
    ...slice,
    hidden,
    itemOrder: itemOrderChanged ? itemOrder : slice.itemOrder,
    pinned,
    placement,
  });
}

/**
 * Folds the older per-Space agent nav (`shell.spaces.agent_nav.v1`: agent ids
 * pinned and ordered) into this document, once: pins become `agent:<id>`
 * favourites when the Space has none yet, and the unpinned order becomes the
 * manual order of the Agenten section when that is still empty.
 */
export function foldAgentNavIntoConversationNav(
  doc: SpacesConversationNavDocument,
  spaceId: string,
  agentNav: { pinned: readonly string[]; order: readonly string[] }
): SpacesConversationNavDocument {
  const slice = storedSlice(doc, spaceId);
  const toItems = (ids: readonly string[]) =>
    ids
      .map((id) => id.trim())
      .filter(Boolean)
      .map((id) => conversationItemKey("agent", id));
  const pinned =
    slice.pinned.length === 0
      ? uniqueItems(
          toItems(agentNav.pinned),
          SPACES_CONVERSATION_NAV_MAX_PINNED
        )
      : slice.pinned;
  const pinnedSet = new Set<string>(pinned);
  const agentsOrder = slice.itemOrder.agents ?? [];
  const folded =
    agentsOrder.length === 0
      ? uniqueItems(
          toItems(agentNav.order).filter((item) => !pinnedSet.has(item)),
          SPACES_CONVERSATION_NAV_MAX_ITEM_ORDER
        )
      : agentsOrder;
  const pinnedChanged = pinned !== slice.pinned && pinned.length > 0;
  const orderChanged = folded !== agentsOrder && folded.length > 0;
  if (!(pinnedChanged || orderChanged)) {
    return doc;
  }
  return writeSpace(doc, spaceId, {
    ...slice,
    itemOrder: orderChanged
      ? { ...slice.itemOrder, agents: folded }
      : slice.itemOrder,
    pinned: pinnedChanged ? pinned : slice.pinned,
  });
}
