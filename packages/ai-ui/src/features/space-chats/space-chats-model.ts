/**
 * Every conversation held in one space, arranged so a person can read it
 * (PLAN-space-chats.md, PLAN-agent-rooms.md §10).
 *
 * The space's chats come from ONE query — `GET /ai/threads?space_id=…` with no
 * host key — because "what was said in this space" is a question about the
 * place, not about which UI surface said it; the rooms a person may read but
 * never joined come from the room directory and are folded in. Everything
 * that makes that list legible is here, as pure functions, for the reason the
 * rest of this codebase splits them out: the page and the sidebar must not
 * disagree about what counts as a chat, what kind it is, or who else can see
 * it.
 */
import {
  type AgentEngentyKind,
  resolveAgentEngenty,
} from "@engenty/ai-core/browser";
import type { AppsAiThreadRecord } from "../../ag-ui/apps-ai/apps-ai-thread-api.js";

/**
 * What a conversation IS, read off the thread's route context the way the
 * server decides it (`threadKind` in apps/ai):
 * - `room`: opened as one — named, with a purpose and members;
 * - `dm`: one person's private line with an agent;
 * - `desk`: the agent's one shared conversation with the team.
 * Run threads never reach this: {@link unattendedRunIdOfThread} drops them.
 */
export type SpaceChatKind = "desk" | "dm" | "room";

export function spaceChatKind(
  thread: Pick<AppsAiThreadRecord, "route_context">
): SpaceChatKind {
  const route = thread.route_context as {
    dm?: unknown;
    room?: unknown;
  } | null;
  if (route?.dm === true) {
    return "dm";
  }
  if (route?.room === true) {
    return "room";
  }
  return "desk";
}

/** Who may read a conversation: the thread's own flag; absent reads as `space`. */
export type SpaceChatVisibility = "private" | "space";

export function spaceChatVisibility(
  visibility: string | null | undefined
): SpaceChatVisibility {
  return visibility === "private" ? "private" : "space";
}

/**
 * Sender names on user bubbles exist so people in a shared conversation can
 * tell whose turn it was. A DM is one person and one agent, and a personal
 * agent's every thread is one person's — the label is noise there.
 */
export function transcriptShowsSenderLabels(input: {
  agentScope?: string | null;
  routeContext?: Record<string, unknown> | null;
}): boolean {
  if (input.agentScope?.trim() === "personal") {
    return false;
  }
  return spaceChatKind({ route_context: input.routeContext ?? {} }) !== "dm";
}

/** Rooms first: they are the ones with a way in. Then the desks, then yours. */
export const SPACE_CHAT_KIND_ORDER: readonly SpaceChatKind[] = [
  "room",
  "desk",
  "dm",
];

export interface SpaceChatAgentInfo {
  /** Blob character; absent hashes a stable one from the id. */
  engenty?: string | null;
  id: string;
  name: string;
}

export interface SpaceChatRow {
  agentId: string;
  agentName: string;
  /** Null on an unattended run's thread — no human started it. */
  createdByUserId: string | null;
  /**
   * The agent's blob, carried on the ROW as well as on the group.
   *
   * The flat list (the sidebar's recent chats) has no group heading to hang it
   * on, and the blob is the only thing in a sidebar row that says who the
   * conversation was with.
   */
  engenty: AgentEngentyKind;
  id: string;
  /** Whether the viewer is in it. Only a room can be listed without. */
  joined: boolean;
  kind: SpaceChatKind;
  /** Every agent in a room, host first; the one agent otherwise. */
  memberAgentIds: string[];
  status: string;
  title: string | null;
  updatedAt: string;
  visibility: SpaceChatVisibility;
}

export interface SpaceChatAgentGroup {
  agentId: string;
  agentName: string;
  engenty: AgentEngentyKind;
  rows: SpaceChatRow[];
}

export interface SpaceChatKindGroup {
  /** Desks, grouped by their agent — the one kind where the agent IS the heading. */
  agents: SpaceChatAgentGroup[];
  kind: SpaceChatKind;
  /** Rooms and DMs, flat, newest first. */
  rows: SpaceChatRow[];
  total: number;
}

/**
 * A room from the directory: readable by the viewer, joined or not. The
 * thread list only holds what the viewer is in, so an open room they never
 * walked into comes from here.
 */
export interface SpaceChatDirectoryRoom {
  joined: boolean;
  members: readonly { agent_id: string }[];
  session: {
    agent_id: string;
    created_by_user_id: string | null;
    id: string;
    route_context?: Record<string, unknown>;
    status?: string;
    title: string | null;
    updated_at: string;
    visibility?: string;
  };
}

/**
 * The unattended job that wrote this thread, or null for a real conversation.
 *
 * A fire is a RUN, never a chat. `listThreadsForSpaceAgent` folds run threads
 * into a specialist's list on purpose — an unattended agent's desk would
 * otherwise be empty — but a ten-minute routine would then fill "Chats" with
 * hundreds of rows nobody ever said anything in, and bury the handful that were
 * actual conversations.
 *
 * THREE markers, because the two lanes that mint these rows stamp different
 * places and only one of them was obvious:
 *
 *  - a routine FIRE writes `route_context.routine_id` (what `agent-desk/service`
 *    reads), and
 *  - a workflow run writes `metadata.source: "workflow-run"` with `routine_id` /
 *    `workflow_id`.
 *
 * Checking only the first looked right in code and was wrong on screen: a live
 * space showed a `WORKFLOW:…` heading over rows titled as a shared conversation.
 */
export function unattendedRunIdOfThread(
  thread: Pick<AppsAiThreadRecord, "metadata" | "route_context">
): string | null {
  const fromRoute = (thread.route_context as { routine_id?: unknown } | null)
    ?.routine_id;
  if (typeof fromRoute === "string" && fromRoute.trim()) {
    return fromRoute.trim();
  }
  const metadata = thread.metadata as {
    routine_id?: unknown;
    source?: unknown;
    workflow_id?: unknown;
  } | null;
  for (const value of [metadata?.routine_id, metadata?.workflow_id]) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return metadata?.source === "workflow-run" ? "workflow-run" : null;
}

function matchesQuery(row: SpaceChatRow, query: string): boolean {
  if (!query) {
    return true;
  }
  const needle = query.toLowerCase();
  return (
    (row.title ?? "").toLowerCase().includes(needle) ||
    row.agentName.toLowerCase().includes(needle)
  );
}

function compareByRecency(left: SpaceChatRow, right: SpaceChatRow): number {
  return left.updatedAt < right.updatedAt ? 1 : -1;
}

export interface OrganizeSpaceChatsInput {
  agentsById: ReadonlyMap<string, SpaceChatAgentInfo>;
  /** Rooms the viewer may read; the ones not in `threads` are listed unjoined. */
  directory?: readonly SpaceChatDirectoryRoom[];
  /** Trimmed by the caller or not — this handles both. */
  query?: string;
  threads: readonly AppsAiThreadRecord[];
}

function rowFor(
  input: {
    agentId: string;
    createdByUserId: string | null;
    id: string;
    joined: boolean;
    kind: SpaceChatKind;
    memberAgentIds: string[];
    status: string;
    title: string | null;
    updatedAt: string;
    visibility: string | null | undefined;
  },
  agentsById: ReadonlyMap<string, SpaceChatAgentInfo>
): SpaceChatRow {
  const agent = agentsById.get(input.agentId);
  return {
    agentId: input.agentId,
    agentName: agent?.name?.trim() || input.agentId,
    createdByUserId: input.createdByUserId,
    engenty: resolveAgentEngenty(input.agentId, agent?.engenty),
    id: input.id,
    joined: input.joined,
    kind: input.kind,
    memberAgentIds: input.memberAgentIds,
    status: input.status,
    title: input.title?.trim() || null,
    updatedAt: input.updatedAt,
    visibility: spaceChatVisibility(input.visibility),
  };
}

/**
 * One space's threads as rows, newest first, plus the directory's rooms the
 * viewer is not in.
 *
 * An agent the catalog does not know still gets a row, labelled with its id:
 * an agent can be unmounted (or renamed, or module-removed) while its
 * conversations remain, and dropping those rows would make a chat the user
 * remembers having simply not exist.
 */
export function spaceChatRows(input: OrganizeSpaceChatsInput): SpaceChatRow[] {
  const query = input.query?.trim().toLowerCase() ?? "";
  const rows: SpaceChatRow[] = [];
  const seen = new Set<string>();
  for (const thread of input.threads) {
    if (unattendedRunIdOfThread(thread)) {
      continue;
    }
    seen.add(thread.id);
    const row = rowFor(
      {
        agentId: thread.agent_id,
        createdByUserId: thread.created_by_user_id,
        id: thread.id,
        joined: true,
        kind: spaceChatKind(thread),
        memberAgentIds: [thread.agent_id],
        status: thread.status,
        title: thread.title,
        updatedAt: thread.updated_at,
        visibility: (thread as { visibility?: string }).visibility,
      },
      input.agentsById
    );
    if (matchesQuery(row, query)) {
      rows.push(row);
    }
  }
  for (const room of input.directory ?? []) {
    const memberAgentIds = room.members.map((member) => member.agent_id);
    const existing = rows.find((row) => row.id === room.session.id);
    if (existing) {
      existing.memberAgentIds = memberAgentIds;
      continue;
    }
    if (seen.has(room.session.id)) {
      continue;
    }
    const row = rowFor(
      {
        agentId: room.session.agent_id,
        createdByUserId: room.session.created_by_user_id,
        id: room.session.id,
        joined: room.joined,
        kind: "room",
        memberAgentIds,
        status: room.session.status ?? "idle",
        title: room.session.title,
        updatedAt: room.session.updated_at,
        visibility: room.session.visibility,
      },
      input.agentsById
    );
    if (matchesQuery(row, query)) {
      rows.push(row);
    }
  }
  return rows.toSorted(compareByRecency);
}

/**
 * The same rows, grouped the way the page shows them: by kind, and the desks
 * by their agent.
 *
 * Kind is the OUTER grouping deliberately: a room has a way in, a desk is the
 * team's, a DM is yours — the one thing about a row a reader must not get
 * wrong. A per-row marker is exactly the kind of thing that stops being read
 * after the third screenful.
 *
 * Empty groups are dropped: a space with no rooms should not carry an empty
 * "Rooms" heading.
 */
export function organizeSpaceChats(
  input: OrganizeSpaceChatsInput
): SpaceChatKindGroup[] {
  const rows = spaceChatRows(input);
  const groups: SpaceChatKindGroup[] = [];
  for (const kind of SPACE_CHAT_KIND_ORDER) {
    const scoped = rows.filter((row) => row.kind === kind);
    if (scoped.length === 0) {
      continue;
    }
    if (kind !== "desk") {
      groups.push({ agents: [], kind, rows: scoped, total: scoped.length });
      continue;
    }
    const byAgent = new Map<string, SpaceChatAgentGroup>();
    for (const row of scoped) {
      const existing = byAgent.get(row.agentId);
      if (existing) {
        existing.rows.push(row);
        continue;
      }
      byAgent.set(row.agentId, {
        agentId: row.agentId,
        agentName: row.agentName,
        engenty: row.engenty,
        rows: [row],
      });
    }
    // Agents ordered by their most recent conversation, not alphabetically:
    // the list answers "what has been going on here", and the agent you spoke
    // to ten minutes ago belongs above the one you spoke to in March.
    const agents = [...byAgent.values()].toSorted((left, right) =>
      compareByRecency(
        left.rows[0] as SpaceChatRow,
        right.rows[0] as SpaceChatRow
      )
    );
    groups.push({ agents, kind, rows: [], total: scoped.length });
  }
  return groups;
}
