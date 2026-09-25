// The one primitive of a room: a message delivered to it wakes the agent it
// addresses. A colleague's hand-off, a person's post through the API and a
// routine's report are the same thing with a different sender.
//
// Who answers is never a model's guess: the mentioned members, in order; with
// nobody mentioned, the host. Each addressee gets its own ROOT run on the
// room's thread — the full floor, `message_agent` included — one after the
// other, never side by side. A woken run that hands the next step to another
// member calls the same function, so a chain of agents is a chain of turns in
// one room, bounded by the room's turn budget (room-turns.ts) rather than by
// a nesting depth.
//
// The queue is per process: two apps/ai instances would each run a turn.
// Before a second instance exists, the Mastra pubsub has to be shared so its
// thread leases hold — noted in PLAN-agent-rooms.md R0.
import { formatAgentMessageHeader } from "@engenty/ai-core";
import { createLogger } from "@engenty/telemetry";
import type { EngentyToolsRunContext } from "../../../ai/tools/engenty-tools/lib/run-context.js";
import type { AgentRunStore } from "../../dal/threads/agent-run-store.js";
import type { ThreadStore } from "../../dal/threads/index.js";
import type { ThreadRow } from "../../dal/threads/types.js";
import {
  emitInboxNotification,
  resolveNotifications,
} from "../../notifications/inbox.js";
import { runDelegatedConversation } from "../conversation/delegate-run.js";
import { buildHeadlessWorkspace } from "../jobs/headless-workspace.js";
import { resolveTaskJobServiceScope } from "../jobs/task-job-scope.js";
import type { AiRegistry, RuntimeModelConfig } from "../registry/index.js";
import {
  resolveRunSpaceById,
  toolsSpaceFromResolution,
} from "../sessions/run-space.js";
import type { AiSessionScope } from "../sessions/types.js";
import { resolveUserDisplayNames } from "../sessions/user-display-names.js";
import { type AlterEgo, alterEgoMetadata } from "./alter-ego.js";
import {
  HUMAN_TURN_ROOM_PATCH,
  ROOM_AGENT_TURNS_KEY,
  ROOM_PAUSED_KEY,
  ROOM_TURN_BUDGET,
  readRoomPurpose,
  readRoomTurnState,
  roomBudgetSpent,
} from "./room-turns.js";

const logger = createLogger({ name: "rooms" });

/** Message metadata naming the agent that wrote a room row. */
export const ROOM_AUTHOR_AGENT_KEY = "author_agent_id";
export const ROOM_AUTHOR_AGENT_NAME_KEY = "author_agent_name";

export type RoomSender =
  | {
      agentId: string;
      /** Whose copilot posts, when the agent is one (alter-ego.ts). */
      alterEgo?: AlterEgo | null;
      name: string;
    }
  | { name: string; userId: string };

export interface DeliverToRoomInput {
  from: RoomSender;
  /** Agent ids addressed, in order. Empty: the host answers. */
  mentions?: readonly string[];
  modelConfig?: RuntimeModelConfig | null;
  registry: AiRegistry;
  /** Test seam: people's names for the wake line. */
  resolveUserNames?: (
    userIds: readonly string[]
  ) => Promise<Map<string, string>>;
  roomId: string;
  /** The run index the woken turns land in. */
  runStore?: AgentRunStore | null;
  /** Test seam: how one addressee's turn runs. */
  runTurn?: (input: RoomTurnInput) => Promise<void>;
  store: ThreadStore;
  tenantId: string;
  text: string;
}

export type DeliverToRoomResult =
  | {
      addressed: string[];
      /** How many agent turns the room has had since a person spoke, after this. */
      agentTurns: number;
      ok: true;
      roomId: string;
    }
  | {
      code: "no_room" | "not_a_member" | "room_paused" | "no_addressee";
      message: string;
      ok: false;
    };

export interface RoomTurnInput {
  agentId: string;
  modelConfig?: RuntimeModelConfig | null;
  registry: AiRegistry;
  room: ThreadRow;
  runStore: AgentRunStore | null;
  store: ThreadStore;
  /** What woke the agent — the sender line the prompt opens with. */
  wakeLine: string;
}

/** One turn at a time per room, in arrival order. */
const roomQueues = new Map<string, Promise<void>>();

function enqueueRoomTurn(roomId: string, turn: () => Promise<void>): void {
  const previous = roomQueues.get(roomId) ?? Promise.resolve();
  const next = previous.then(turn, turn).catch((error: unknown) => {
    logger.error("room turn failed", {
      message: error instanceof Error ? error.message : String(error),
      roomId,
    });
  });
  roomQueues.set(roomId, next);
  void next.finally(() => {
    if (roomQueues.get(roomId) === next) {
      roomQueues.delete(roomId);
    }
  });
}

/** @internal test seam */
export async function drainRoomQueuesForTests(): Promise<void> {
  await Promise.all([...roomQueues.values()]);
}

export async function deliverToRoom(
  input: DeliverToRoomInput
): Promise<DeliverToRoomResult> {
  const { store, tenantId } = input;
  const room = await store.getThread({ tenantId, threadId: input.roomId });
  if (!room) {
    return { code: "no_room", message: "This room does not exist.", ok: false };
  }
  const members = await store.listAgentMembers({
    tenantId,
    threadId: input.roomId,
  });
  const memberIds = new Set(members.map((member) => member.agent_id));
  memberIds.add(room.agent_id);
  const sender = input.from;
  if ("agentId" in sender && !memberIds.has(sender.agentId)) {
    return {
      code: "not_a_member",
      message: `${sender.agentId} is not in this room.`,
      ok: false,
    };
  }
  const mentioned = [...new Set(input.mentions ?? [])].filter(
    (id) => !("agentId" in sender && id === sender.agentId)
  );
  const outsiders = mentioned.filter((id) => !memberIds.has(id));
  if (outsiders.length > 0) {
    return {
      code: "not_a_member",
      message: `Not in this room: ${outsiders.join(", ")}. Add them first, or message them directly.`,
      ok: false,
    };
  }
  const addressed =
    mentioned.length > 0
      ? mentioned
      : "agentId" in sender && sender.agentId === room.agent_id
        ? []
        : [room.agent_id];
  if (addressed.length === 0) {
    return {
      code: "no_addressee",
      message: "Name the member this is for — you host this room.",
      ok: false,
    };
  }

  // The budget: a person's word restarts it; an agent's spends it.
  const state = readRoomTurnState(room.metadata);
  const ownerUserId = room.created_by_user_id;
  if ("userId" in sender) {
    if (state.agentTurns > 0 || state.paused) {
      await mergeRoomMetadata(store, room, HUMAN_TURN_ROOM_PATCH);
    }
  } else if (roomBudgetSpent(state)) {
    if (!state.paused) {
      await pauseRoom({ ownerUserId, room, state, store });
    }
    return {
      code: "room_paused",
      message: `This room has had ${state.agentTurns} agent turns without a person saying anything and is paused. It continues when someone posts here.`,
      ok: false,
    };
  }

  // The message itself, as a row every member's next turn reads. An agent's
  // words carry the sender header the transcript already draws as "Message
  // from …", and name the agent in metadata for anyone who reads the row.
  const isAgent = "agentId" in sender;
  await store.appendMessage({
    authorUserId: isAgent ? null : sender.userId,
    metadata: isAgent
      ? {
          [ROOM_AUTHOR_AGENT_KEY]: sender.agentId,
          [ROOM_AUTHOR_AGENT_NAME_KEY]: sender.name,
          ...alterEgoMetadata(sender.alterEgo),
        }
      : {},
    parts: [
      {
        text: isAgent
          ? `${formatAgentMessageHeader(sender.name, sender.agentId)}${input.text}`
          : input.text,
        type: "text",
      },
    ],
    role: "user",
    tenantId,
    threadId: input.roomId,
  });

  // The wake line: who posted, what the room is for, who is in it — agents
  // by id (so a hand-off names the right one) and people by name.
  const memberNames = await Promise.all(
    [...memberIds].map(async (id) => {
      const config = await input.registry.getAgentConfig(id);
      return `${config?.name ?? id} (\`${id}\`)`;
    })
  );
  const people = await store.listUserParticipants({
    tenantId,
    threadId: input.roomId,
  });
  const personNames = await (input.resolveUserNames ?? resolveUserDisplayNames)(
    people.map((person) => person.user_id)
  );
  const peopleLine =
    people.length > 0
      ? ` People in this room: ${people
          .map((person) => personNames.get(person.user_id) ?? "a person")
          .join(", ")}.`
      : "";
  const purpose = readRoomPurpose(room.metadata);
  const purposeLine = purpose ? ` This room is for: ${purpose}` : "";
  const wakeLine = `${sender.name} posted in this room (the last message above).${purposeLine} Agents in this room: ${memberNames.join(", ")}.${peopleLine}`;
  const runTurn = input.runTurn ?? runRoomTurn;
  const agentTurns = isAgent ? state.agentTurns : 0;
  for (const [index, agentId] of addressed.entries()) {
    const turnNumber = agentTurns + index + 1;
    enqueueRoomTurn(input.roomId, async () => {
      // Re-read: a person may have posted, or the budget may have run out,
      // while this turn waited behind another.
      const current = await store.getThread({
        tenantId,
        threadId: input.roomId,
      });
      if (!current) {
        return;
      }
      const currentState = readRoomTurnState(current.metadata);
      if (currentState.paused) {
        return;
      }
      if (currentState.agentTurns >= ROOM_TURN_BUDGET) {
        await pauseRoom({
          ownerUserId,
          room: current,
          state: currentState,
          store,
        });
        return;
      }
      // One run per room includes the host's own live turn: a person's
      // message runs on the chat lane, outside this queue, and its status
      // is on the thread row.
      await waitForRoomIdle(
        store,
        input.runStore ?? null,
        tenantId,
        input.roomId
      );
      await runTurn({
        agentId,
        modelConfig: input.modelConfig ?? null,
        registry: input.registry,
        room: current,
        runStore: input.runStore ?? null,
        store,
        wakeLine,
      });
      await mergeRoomMetadata(store, current, {
        [ROOM_AGENT_TURNS_KEY]: currentState.agentTurns + 1,
      });
      logger.info("room turn done", {
        agentId,
        roomId: input.roomId,
        turn: turnNumber,
      });
    });
  }
  return {
    addressed,
    agentTurns: agentTurns + addressed.length,
    ok: true,
    roomId: input.roomId,
  };
}

/**
 * One addressee's turn: a root run of that agent on the room's thread, as
 * the AI service, in the room's Space — the same footing as a routine fire.
 * The wake line is the prompt and is NOT persisted: the message the agent
 * answers is already the last row of the room.
 */
async function runRoomTurn(input: RoomTurnInput): Promise<void> {
  const { room } = input;
  const scope: AiSessionScope = await resolveTaskJobServiceScope(
    room.tenant_id
  );
  const runId = crypto.randomUUID();
  const spaceId = room.space_id?.trim() || null;
  const space: EngentyToolsRunContext["space"] = spaceId
    ? toolsSpaceFromResolution(
        await resolveRunSpaceById({
          runId,
          scope,
          spaceId,
          ...(room.created_by_user_id
            ? { actingUserId: room.created_by_user_id }
            : {}),
        })
      )
    : null;
  const ws = await buildHeadlessWorkspace({
    agentId: input.agentId,
    registry: input.registry,
    runId,
    scope,
    threadId: room.id,
    ...(spaceId ? { spaceId } : {}),
  });
  const config = await input.registry.getAgentConfig(input.agentId);
  // The thread says a turn is on: the desk attaches to it (and steers a
  // person's words into it instead of starting a turn beside it), and a
  // person's own lane waits for it. Same marker the chat lane sets.
  await input.store.setThreadStatus({
    status: "running",
    tenantId: room.tenant_id,
    threadId: room.id,
  });
  const result = await runDelegatedConversation({
    approvalPolicy: "defer",
    brief: `${input.wakeLine} You are ${config?.name ?? input.agentId}. Act on it as yourself and answer here. If the next step belongs to another member, hand it to them with message_agent (mode notify) and say so.`,
    childAgentId: input.agentId,
    childRunId: runId,
    childThreadId: room.id,
    delegationDepth: 0,
    ...(input.modelConfig ? { modelConfig: input.modelConfig } : {}),
    observe: { runStore: input.runStore, tenantId: room.tenant_id },
    persistCurrentUserTurn: false,
    registry: input.registry,
    scope,
    space,
    store: input.store,
    ...(ws?.workspace ? { workspace: ws.workspace } : {}),
    ...(ws?.sandboxProvider ? { sandboxProvider: ws.sandboxProvider } : {}),
  });
  // Another run may have started on the thread meanwhile (a person's live
  // turn); its own end writes the status then, so this one leaves it alone.
  if (
    !(await threadHasRunInFlight(
      input.store,
      input.runStore,
      room.tenant_id,
      room.id
    ))
  ) {
    await input.store.setThreadStatus({
      status: result.error ? "failed" : "completed",
      tenantId: room.tenant_id,
      threadId: room.id,
    });
  }
  if (result.error) {
    logger.warn("room turn ended with an error", {
      agentId: input.agentId,
      error: result.error,
      roomId: room.id,
    });
  }
}

const ROOM_IDLE_POLL_MS = 1000;
const ROOM_IDLE_WAIT_MS = 120_000;

/**
 * Whether a run is answering on this thread right now. The run index is the
 * truth when there is one — a live turn and a room turn each write the
 * thread's status, and the later write of the two wins regardless of which
 * run is still going.
 */
async function threadHasRunInFlight(
  store: ThreadStore,
  runStore: AgentRunStore | null,
  tenantId: string,
  roomId: string
): Promise<boolean> {
  if (runStore) {
    const runs = await runStore.listRunsForThread({
      limit: 10,
      tenantId,
      threadId: roomId,
    });
    return runs.some((run) => run.status === "running");
  }
  const row = await store.getThread({ tenantId, threadId: roomId });
  return row?.status === "running";
}

async function waitForRoomIdle(
  store: ThreadStore,
  runStore: AgentRunStore | null,
  tenantId: string,
  roomId: string
): Promise<void> {
  const deadline = Date.now() + ROOM_IDLE_WAIT_MS;
  while (Date.now() < deadline) {
    if (!(await threadHasRunInFlight(store, runStore, tenantId, roomId))) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, ROOM_IDLE_POLL_MS));
  }
  logger.warn("room still running past the wait; taking the turn anyway", {
    roomId,
  });
}

async function mergeRoomMetadata(
  store: ThreadStore,
  room: ThreadRow,
  patch: Record<string, unknown>
): Promise<void> {
  // Every room keeps its budget, owner or not: a pair room two agents opened
  // between themselves (a routine fire, a turn inside another room) is the
  // one with nobody watching, so it is the one that must stop on its own.
  await store.mergeThreadMetadataForUser({
    patch,
    tenantId: room.tenant_id,
    threadId: room.id,
    userId: room.created_by_user_id,
  });
}

/**
 * Pause the room and tell every person in it — any of them can continue it.
 * A room with no people (a pair two agents opened) pauses silently and waits
 * for a person to post.
 */
async function pauseRoom(input: {
  ownerUserId: string | null;
  room: ThreadRow;
  state: { agentTurns: number };
  store: ThreadStore;
}): Promise<void> {
  await mergeRoomMetadata(input.store, input.room, { [ROOM_PAUSED_KEY]: true });
  const people = await input.store.listUserParticipants({
    tenantId: input.room.tenant_id,
    threadId: input.room.id,
  });
  const userIds = new Set(people.map((person) => person.user_id));
  if (input.ownerUserId) {
    userIds.add(input.ownerUserId);
  }
  for (const userId of userIds) {
    await emitInboxNotification({
      dedupeKey: `room_paused:${input.room.id}:${input.state.agentTurns}:${userId}`,
      kind: "room_paused",
      metadata: {
        agent_turns: input.state.agentTurns,
        room_thread_id: input.room.id,
        thread_id: input.room.id,
      },
      body: "Say something in the room to continue.",
      priority: "high",
      source: "agents",
      ...(input.room.space_id ? { spaceId: input.room.space_id } : {}),
      subject: { id: input.room.id, type: "thread" },
      summary: `${input.room.title ?? "A room"} paused after ${input.state.agentTurns} agent turns`,
      tenantId: input.room.tenant_id,
      title: {
        key: "room_paused",
        params: {
          count: input.state.agentTurns,
          name: input.room.title ?? "Room",
        },
      },
      userId,
    });
  }
}

/**
 * A person spoke in a room through the chat lane: the budget restarts and a
 * pause lifts. Cheap when there is nothing to reset.
 */
export async function noteHumanTurnInRoom(input: {
  scope: AiSessionScope;
  store: Pick<ThreadStore, "getThread" | "mergeThreadMetadataForUser">;
  threadId: string;
}): Promise<void> {
  // Bookkeeping, never a reason for the person's turn not to start.
  try {
    const room = await input.store.getThread({
      tenantId: input.scope.tenantId,
      threadId: input.threadId,
    });
    if (!room) {
      return;
    }
    const state = readRoomTurnState(room.metadata);
    if (state.agentTurns === 0 && !state.paused) {
      return;
    }
    await input.store.mergeThreadMetadataForUser({
      patch: HUMAN_TURN_ROOM_PATCH,
      tenantId: input.scope.tenantId,
      threadId: input.threadId,
      userId: input.scope.userId,
    });
    // The pause the person just lifted is answered: its "paused" row (one
    // per person in the room) closes for everyone.
    if (state.paused) {
      await resolveNotifications({
        outcome: "resumed",
        subjectId: room.id,
        subjectType: "thread",
        tenantId: input.scope.tenantId,
      });
    }
  } catch (error) {
    logger.warn("room budget reset skipped", {
      message: error instanceof Error ? error.message : String(error),
      threadId: input.threadId,
    });
  }
}
