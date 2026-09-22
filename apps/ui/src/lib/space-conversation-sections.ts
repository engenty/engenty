import type { SpaceDmRow, SpaceRoomRow } from "@engenty/ai-ui";
import {
  type BuiltInSectionId,
  type ConversationNavItem,
  conversationItemKey,
  isConversationHidden,
  type SpacesConversationNavSpace,
} from "@engenty/user-settings";
import type { SpaceAgentActivity } from "@/lib/space-agent-activity";
import { compareSpaceAgents } from "@/lib/space-agent-nav";
import type { SpaceRosterAgent } from "@/lib/use-space-roster-agents";

/**
 * The sidebar of one person in one Space, resolved from what exists (the
 * roster, the rooms they are in, their DMs) and how they filed it (the
 * conversation-nav document): Favoriten on top, then their personal sections,
 * then the three built-ins. Pure, so the sidebar and its tests agree.
 *
 * Rules (Slack's): a row is in exactly one place — pinned, or the section it
 * was filed into, or the built-in of its kind. Hidden rows stay out until
 * they have something newer than the moment they were hidden; a desk cannot
 * be hidden, it is the roster.
 */
export type SpaceConversationItem =
  | {
      activity: SpaceAgentActivity | undefined;
      agent: SpaceRosterAgent;
      key: ConversationNavItem;
      kind: "desk";
      updatedAt: string | null;
    }
  | {
      key: ConversationNavItem;
      kind: "room";
      room: SpaceRoomRow;
      updatedAt: string;
    }
  | {
      agent: SpaceRosterAgent | null;
      dm: SpaceDmRow;
      key: ConversationNavItem;
      kind: "dm";
      updatedAt: string;
    };

export type SpaceConversationSectionKind = "personal" | BuiltInSectionId;

export interface SpaceConversationSectionModel {
  id: string;
  items: SpaceConversationItem[];
  kind: SpaceConversationSectionKind;
  /** A personal section's name; built-ins are labelled by the caller. */
  name: string | null;
}

export interface SpaceConversationSidebarModel {
  favorites: SpaceConversationItem[];
  /** Every row that exists, for pruning the document. */
  knownItems: ConversationNavItem[];
  sections: SpaceConversationSectionModel[];
}

/**
 * The river: the person's one conversation with their copilot — a DM with no
 * Space, because the copilot follows them everywhere. It heads Private in
 * every space and, like a desk, cannot be hidden: it is the one row that is
 * always true of this person.
 */
export function isRiverItem(item: SpaceConversationItem): boolean {
  return item.kind === "dm" && item.dm.session.space_id === null;
}

/** The built-in a row lands in when nobody filed it anywhere. */
export function builtInSectionFor(
  kind: SpaceConversationItem["kind"]
): BuiltInSectionId {
  switch (kind) {
    case "desk":
      return "agents";
    case "room":
      return "rooms";
    case "dm":
      return "dms";
    default:
      return "agents";
  }
}

function compareByActivity(
  left: SpaceConversationItem,
  right: SpaceConversationItem
): number {
  if (left.updatedAt && right.updatedAt) {
    return left.updatedAt < right.updatedAt ? 1 : -1;
  }
  if (left.updatedAt) {
    return -1;
  }
  if (right.updatedAt) {
    return 1;
  }
  return labelOf(left).localeCompare(labelOf(right));
}

function labelOf(item: SpaceConversationItem): string {
  switch (item.kind) {
    case "desk":
      return item.agent.name;
    case "room":
      return item.room.session.title ?? "";
    case "dm":
      return item.agent?.name ?? item.dm.agent_id;
    default:
      return "";
  }
}

/** Manual order first, then whatever the section's own sort says. */
function orderItems(
  items: readonly SpaceConversationItem[],
  manual: readonly string[] | undefined,
  rest: (left: SpaceConversationItem, right: SpaceConversationItem) => number
): SpaceConversationItem[] {
  const byKey = new Map(items.map((item) => [item.key, item]));
  const ordered: SpaceConversationItem[] = [];
  const seen = new Set<string>();
  for (const key of manual ?? []) {
    const item = byKey.get(key as ConversationNavItem);
    if (item && !seen.has(key)) {
      ordered.push(item);
      seen.add(key);
    }
  }
  const remaining = items.filter((item) => !seen.has(item.key)).toSorted(rest);
  return [...ordered, ...remaining];
}

export function resolveSpaceConversationSections(input: {
  activityByAgentId: ReadonlyMap<string, SpaceAgentActivity>;
  agents: readonly SpaceRosterAgent[];
  dms: readonly SpaceDmRow[];
  rooms: readonly SpaceRoomRow[];
  slice: SpacesConversationNavSpace;
}): SpaceConversationSidebarModel {
  const agentsById = new Map(input.agents.map((agent) => [agent.id, agent]));
  const items: SpaceConversationItem[] = [
    ...input.agents.map((agent): SpaceConversationItem => {
      const activity = input.activityByAgentId.get(agent.id);
      return {
        activity,
        agent,
        key: conversationItemKey("agent", agent.id),
        kind: "desk",
        updatedAt: activity?.updatedAt ?? null,
      };
    }),
    ...input.rooms.map(
      (room): SpaceConversationItem => ({
        key: conversationItemKey("thread", room.session.id),
        kind: "room",
        room,
        updatedAt: room.session.updated_at,
      })
    ),
    ...input.dms.map(
      (dm): SpaceConversationItem => ({
        agent: agentsById.get(dm.agent_id) ?? null,
        dm,
        key: conversationItemKey("thread", dm.session.id),
        kind: "dm",
        updatedAt: dm.session.updated_at,
      })
    ),
  ];
  const knownItems = items.map((item) => item.key);
  const byKey = new Map(items.map((item) => [item.key, item]));
  const { slice } = input;

  const pinnedKeys = new Set<string>();
  const favorites: SpaceConversationItem[] = [];
  for (const key of slice.pinned) {
    const item = byKey.get(key);
    if (item && !pinnedKeys.has(key)) {
      favorites.push(item);
      pinnedKeys.add(key);
    }
  }

  const personalIds = new Set(slice.sections.map((section) => section.id));
  const membership = new Map<string, SpaceConversationItem[]>();
  for (const item of items) {
    if (pinnedKeys.has(item.key)) {
      continue;
    }
    if (
      item.kind !== "desk" &&
      !isRiverItem(item) &&
      isConversationHidden(slice, item.key, item.updatedAt)
    ) {
      continue;
    }
    const placed = slice.placement[item.key];
    const sectionId =
      placed && (personalIds.has(placed) || isBuiltIn(placed))
        ? placed
        : builtInSectionFor(item.kind);
    const list = membership.get(sectionId) ?? [];
    list.push(item);
    membership.set(sectionId, list);
  }

  const names = new Map(
    slice.sections.map((section) => [section.id, section.name])
  );
  // The document's order, completed: a built-in it never named comes last.
  const order = slice.order.filter(
    (id) => isBuiltIn(id) || personalIds.has(id)
  );
  for (const id of ["agents", "rooms", "dms"] as const) {
    if (!order.includes(id)) {
      order.push(id);
    }
  }
  const sections: SpaceConversationSectionModel[] = order.map((id) => {
    const kind: SpaceConversationSectionKind = isBuiltIn(id) ? id : "personal";
    const rest =
      id === "agents"
        ? (left: SpaceConversationItem, right: SpaceConversationItem) =>
            left.kind === "desk" && right.kind === "desk"
              ? compareSpaceAgents(left.agent, right.agent)
              : compareByActivity(left, right)
        : id === "dms"
          ? (left: SpaceConversationItem, right: SpaceConversationItem) =>
              // The river first, always; the rest by activity.
              isRiverItem(left) === isRiverItem(right)
                ? compareByActivity(left, right)
                : isRiverItem(left)
                  ? -1
                  : 1
          : compareByActivity;
    return {
      id,
      items: orderItems(membership.get(id) ?? [], slice.itemOrder[id], rest),
      kind,
      name: names.get(id) ?? null,
    };
  });

  return { favorites, knownItems, sections };
}

function isBuiltIn(id: string): id is BuiltInSectionId {
  return id === "agents" || id === "rooms" || id === "dms";
}
