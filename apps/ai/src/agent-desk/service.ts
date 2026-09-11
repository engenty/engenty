import { AG_UI_OPEN_INTERRUPT_METADATA_KEY } from "@engenty/ag-ui-bridge";
import {
  type AgentDeskEngagement,
  type AgentDeskFeed,
  type AgentDeskLane,
  agentDeskCapabilityChips,
  emptyAgentDeskLaneCounts,
  resolveAgentEngenty,
  selectAgentDeskStarters,
} from "@engenty/ai-core";
import type {
  EngentySpace,
  EngentySpaceSurface,
} from "../ai/core-http-client.js";
import type { AgentConfig } from "../ai/registry/types.js";
import { decorateAgentWithRole } from "../api/agent-role.js";
import {
  isDmThread,
  isRoomThread,
  type ThreadRow,
} from "../dal/threads/types.js";

export interface AgentDeskTask {
  checkout_run_id: string | null;
  completed_at: string | null;
  has_open_question?: boolean;
  id: string;
  identifier: string;
  pending_approval_operation_ids?: string[];
  status: string;
  title: string;
  updated_at: string;
}

export interface AgentDeskServiceDependencies {
  getAgent: (agentId: string) => Promise<AgentConfig | undefined>;
  getSpaceSurface: (spaceId: string) => Promise<EngentySpaceSurface>;
  listSpaces: () => Promise<EngentySpace[]>;
  listTasks: (input: {
    agentId: string;
    spaceId: string;
  }) => Promise<AgentDeskTask[]>;
  listThreads: (input: {
    agentId: string;
    limit: number;
    spaceId: string;
  }) => Promise<ThreadRow[]>;
}

export class AgentDeskNotFoundError extends Error {
  readonly code: "agent_not_found" | "agent_not_mounted";

  constructor(code: "agent_not_found" | "agent_not_mounted") {
    super(code);
    this.code = code;
  }
}

const LANE_PRIORITY: Record<AgentDeskLane, number> = {
  waiting: 0,
  active: 1,
  conversation: 2,
  assigned: 3,
  completed: 4,
};

/** The routine whose fire wrote this thread, or null for a real conversation. */
function routineIdOfThread(thread: ThreadRow): string | null {
  const value = thread.route_context?.routine_id;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function conversationLane(thread: ThreadRow): AgentDeskLane {
  if (
    thread.status === "waiting" ||
    thread.metadata[AG_UI_OPEN_INTERRUPT_METADATA_KEY] != null
  ) {
    return "waiting";
  }
  if (thread.status === "running") {
    return "active";
  }
  return thread.status === "completed" || thread.status === "failed"
    ? "completed"
    : "conversation";
}

function taskLane(task: AgentDeskTask): AgentDeskLane {
  if (
    task.status === "request" ||
    task.status === "blocked" ||
    task.has_open_question === true ||
    (task.pending_approval_operation_ids?.length ?? 0) > 0
  ) {
    return "waiting";
  }
  if (
    task.checkout_run_id ||
    task.status === "in_progress" ||
    task.status === "in_review"
  ) {
    return "active";
  }
  return task.status === "done" || task.status === "cancelled"
    ? "completed"
    : "assigned";
}

function encodeCursor(item: AgentDeskEngagement): string {
  return Buffer.from(
    JSON.stringify({ id: item.id, sort_at: item.sort_at }),
    "utf8"
  ).toString("base64url");
}

function decodeCursor(cursor?: string): { id: string; sort_at: string } | null {
  if (!cursor) {
    return null;
  }
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8")
    ) as Record<string, unknown>;
    return typeof parsed.id === "string" && typeof parsed.sort_at === "string"
      ? { id: parsed.id, sort_at: parsed.sort_at }
      : null;
  } catch {
    return null;
  }
}

function compareEngagements(
  left: AgentDeskEngagement,
  right: AgentDeskEngagement
): number {
  return (
    LANE_PRIORITY[left.lane] - LANE_PRIORITY[right.lane] ||
    right.sort_at.localeCompare(left.sort_at) ||
    left.id.localeCompare(right.id)
  );
}

export async function buildAgentDeskFeed(input: {
  agentId: string;
  cursor?: string;
  dependencies: AgentDeskServiceDependencies;
  limit: number;
  locale?: string;
  spaceId: string;
  userFirstName?: string;
}): Promise<AgentDeskFeed> {
  const { dependencies, agentId, spaceId } = input;
  const [surface, spaces] = await Promise.all([
    dependencies.getSpaceSurface(spaceId),
    dependencies.listSpaces(),
  ]);
  if (!surface.agents.includes(agentId)) {
    throw new AgentDeskNotFoundError("agent_not_mounted");
  }
  const agentConfig = await dependencies.getAgent(agentId);
  if (!agentConfig) {
    throw new AgentDeskNotFoundError("agent_not_found");
  }

  const tasksMounted = surface.modules.some(
    (module) => module.moduleId === "tasks" && module.agentAccess !== "none"
  );
  const [threads, tasks] = await Promise.all([
    dependencies.listThreads({ agentId, limit: 200, spaceId }),
    tasksMounted
      ? dependencies.listTasks({ agentId, spaceId })
      : Promise.resolve([]),
  ]);
  const spaceKey = spaces.find((space) => space.id === spaceId)?.key ?? spaceId;
  const deskPath = `/s/${encodeURIComponent(spaceKey)}/agents/${encodeURIComponent(agentId)}`;

  const engagements: AgentDeskEngagement[] = [
    ...threads.map(
      (thread): AgentDeskEngagement => ({
        href: `${deskPath}?engagement=conversation%3A${encodeURIComponent(thread.id)}`,
        id: `conversation:${thread.id}`,
        kind: "conversation",
        lane: conversationLane(thread),
        metadata: {
          has_open_interrupt:
            thread.metadata[AG_UI_OPEN_INTERRUPT_METADATA_KEY] != null,
          // A routine fire's transcript, not a conversation anyone had. It
          // belongs in the feed — it is this agent's work — but a reader has
          // to be able to tell the two apart, and so does the Chat tab, which
          // must never open one as "where you left off".
          routine_id: routineIdOfThread(thread),
          // A colleague's delegated thread or an agent pair's room: listed as
          // this agent's work, read-only, never "where you left off".
          delegated: thread.route_context?.delegated === true,
          // Opened as a room, or a person's DM: the sidebar lists those; the
          // desk opens them only when asked to, never as its default line.
          dm: isDmThread(thread.route_context),
          room: isRoomThread(thread.route_context),
          thread_id: thread.id,
        },
        sort_at: thread.updated_at,
        status: thread.status,
        subtitle: thread.summary,
        title: thread.title?.trim() || "Untitled conversation",
      })
    ),
    ...tasks.map(
      (task): AgentDeskEngagement => ({
        href: `/s/${encodeURIComponent(spaceKey)}/tasks/${encodeURIComponent(task.id)}`,
        id: `task:${task.id}`,
        kind: "task",
        lane: taskLane(task),
        metadata: {
          checkout_run_id: task.checkout_run_id,
          task_id: task.id,
        },
        sort_at: task.updated_at,
        status: task.status,
        subtitle: task.identifier,
        title: task.title,
      })
    ),
  ].sort(compareEngagements);

  const counts = emptyAgentDeskLaneCounts();
  for (const engagement of engagements) {
    counts[engagement.lane] += 1;
  }
  const cursor = decodeCursor(input.cursor);
  const start = cursor
    ? Math.max(
        0,
        engagements.findIndex(
          (item) => item.id === cursor.id && item.sort_at === cursor.sort_at
        ) + 1
      )
    : 0;
  const page = engagements.slice(start, start + input.limit);
  const decorated = decorateAgentWithRole(agentConfig);
  const spaceName =
    spaces.find((space) => space.id === spaceId)?.name ?? spaceKey;
  const hasOpenTasks = tasks.some(
    (task) => task.status !== "done" && task.status !== "cancelled"
  );

  return {
    agent: {
      ...(decorated.agentScope ? { agentScope: decorated.agentScope } : {}),
      can_assign_work: tasksMounted,
      can_ask: decorated.role !== "external",
      connectors: agentDeskCapabilityChips(surface.connectors),
      description: decorated.description ?? null,
      engenty: resolveAgentEngenty(decorated.id, decorated.engenty),
      id: decorated.id,
      managed_by_module: decorated.managed_by_module,
      model: decorated.model ?? null,
      name: decorated.name,
      role: decorated.role,
      skills: agentDeskCapabilityChips(decorated.skillIds),
      source: decorated.source ?? null,
      starters: selectAgentDeskStarters(
        decorated.starters ?? [],
        input.locale ?? "en",
        {
          connectors: surface.connectors ?? [],
          firstVisit: threads.length === 0,
          hasOpenTasks,
          modules: surface.modules,
          spaceName,
          userFirstName: input.userFirstName,
        }
      ),
    },
    engagements: page,
    lane_counts: counts,
    next_cursor:
      start + page.length < engagements.length && page.at(-1)
        ? encodeCursor(page.at(-1) as AgentDeskEngagement)
        : null,
    space_id: spaceId,
  };
}
