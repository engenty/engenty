// Root-run `message_agent`: talk to any Space-mounted specialist as a child
// conversation, or to several at once in a room. Same engine as
// `agent-<alias>` delegation; the tool is generic so a coordinator can hire
// someone this turn and message them next.
//
// `agent_ids` is how an agent gets a group: in a group room it is in, the
// missing colleagues are added; on a desk a new room opens, hosted by the
// sender and owned by the person behind the run, private unless told
// otherwise. Either way the message is a room post (rooms/deliver.ts) and
// every id listed takes a turn. No approval: a room is a chat, reversible
// and visible at once, and its cost is bounded by the room's turn budget.

import {
  formatAgentMessageHeader,
  resolveAgentEngenty,
} from "@engenty/ai-core";
import { createLogger } from "@engenty/telemetry";
import { createTool } from "@mastra/core/tools";
import {
  type ToolApprovalSuspendPayload,
  toolApprovalResumeSchema,
  toolApprovalSuspendSchema,
} from "../../../ai/tools/engenty-tools/lib/execute-approval.js";
import {
  getEngentyToolsRunContext,
  type ToolRequestContextCarrier,
} from "../../../ai/tools/engenty-tools/lib/run-context.js";
import { isUnresolvedSpaceGate } from "../../../ai/tools/engenty-tools/lib/space-gate.js";
import {
  MESSAGE_AGENT_DESCRIPTION,
  MESSAGE_AGENT_TOOL_ID,
  type MessageAgentMode,
  messageAgentInputSchema,
} from "../../../ai/tools/message-agent-tool.js";
import {
  isRoomThread,
  THREAD_ROOM_KEY,
  type ThreadRow,
  type ThreadVisibility,
} from "../../dal/threads/types.js";
import { emitInboxNotification } from "../../notifications/inbox.js";
import {
  type AlterEgo,
  alterEgoDisplayName,
  resolveAlterEgo,
} from "../rooms/alter-ego.js";
import { deliverToRoom } from "../rooms/deliver.js";
import {
  ROOM_MAX_AGENTS,
  ROOM_PURPOSE_KEY,
  readRoomPurpose,
} from "../rooms/room-turns.js";
import { scopeAttributionUserId } from "../sessions/types.js";
import { resolveUserDisplayNames } from "../sessions/user-display-names.js";
import {
  AGENT_MESSAGE_MARKER_KEY,
  type AgentMessageMarker,
  resolveAgentPairThread,
} from "../threads/agent-pair-thread.js";
import { resolveSpecialistChatThread } from "../threads/specialist-chat-thread.js";
import {
  type DelegationToolDeps,
  runDelegatedSpecialist,
} from "./delegate-tool.js";
import { markDeskReplyPreview } from "./desk-reply-preview.js";

const logger = createLogger({ name: "message-agent-tool" });

/**
 * How deep agent-to-agent consultation may nest. 1 (the decided budget) means
 * a run may consult a colleague and that colleague may not consult further —
 * blast radius stays at two runs, and a cycle is structurally impossible.
 * Env-overridable for experiments; the product default is the contract.
 */
export function resolveMessageAgentDepthLimit(): number {
  const parsed = Number.parseInt(
    process.env.ENGENTY_AGENT_MESSAGE_DEPTH?.trim() ?? "",
    10
  );
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1;
}

/**
 * What the parent is called in the prose it sends: its own name, or — when
 * it is someone's copilot — that person's copilot (rooms/alter-ego.ts).
 */
async function senderNameFor(
  deps: DelegationToolDeps & { parentAgentId: string },
  sender:
    | { agentScope?: string | null; name?: string | null }
    | null
    | undefined
): Promise<string> {
  const own = sender?.name ?? deps.parentAgentId;
  const ownerUserId = scopeAttributionUserId(deps.scope);
  if (sender?.agentScope !== "personal" || !ownerUserId) {
    return own;
  }
  const names = await resolveUserDisplayNames([ownerUserId]);
  return alterEgoDisplayName(
    { userId: ownerUserId, userName: names.get(ownerUserId) ?? null },
    own
  );
}

/**
 * The parent as an alter ego in `roomId`: a personal-scope agent (the
 * copilot) speaks in a room FOR its person. Marks the membership row on the
 * way in — idempotent — and returns what the rows it writes should carry.
 * Null for every other agent (rooms/alter-ego.ts).
 */
async function alterEgoFor(
  deps: DelegationToolDeps & { parentAgentId: string },
  roomId: string
): Promise<AlterEgo | null> {
  const config = await deps.registry.getAgentConfig(deps.parentAgentId);
  const ownerUserId = scopeAttributionUserId(deps.scope);
  if (config?.agentScope !== "personal" || !ownerUserId) {
    return null;
  }
  await deps.store.markAgentOnBehalfOf({
    agentId: deps.parentAgentId,
    onBehalfOfUserId: ownerUserId,
    tenantId: deps.scope.tenantId,
    threadId: roomId,
  });
  return await resolveAlterEgo({
    agentId: deps.parentAgentId,
    store: deps.store,
    tenantId: deps.scope.tenantId,
    threadId: roomId,
  });
}

export function createMessageAgentTool(
  deps: DelegationToolDeps & {
    mountedAgentIds: ReadonlySet<string>;
    parentAgentId: string;
  }
): ReturnType<typeof createTool> {
  return createTool({
    id: MESSAGE_AGENT_TOOL_ID,
    description: MESSAGE_AGENT_DESCRIPTION,
    inputSchema: messageAgentInputSchema,
    // The parent's HITL seam: an `ask` whose colleague hits the approval gate
    // parks THIS call with one card for the colleague's write set.
    suspendSchema: toolApprovalSuspendSchema,
    resumeSchema: toolApprovalResumeSchema,
    execute: async (input, ctx) => {
      const parsed = input as {
        agent_id?: string;
        agent_ids?: string[];
        message: string;
        mode?: MessageAgentMode;
        purpose?: string;
        room_id?: string;
        title?: string;
        visibility?: ThreadVisibility;
      };
      const message = parsed.message;
      const mode: MessageAgentMode = parsed.mode ?? "ask";
      const space = getEngentyToolsRunContext().space;
      if (isUnresolvedSpaceGate(space)) {
        return {
          ok: false as const,
          code: "space_unresolved",
          message:
            "This run claimed a Space that could not be loaded. Messaging specialists is refused until the Space is available.",
        } as never;
      }
      // A resolved Space is always an allow-list, including an EMPTY one.
      // Only intentional no-Space runs may address the tenant registry.
      const gate = (agentId: string) => {
        if (agentId === deps.parentAgentId) {
          return {
            ok: false as const,
            code: "cannot_message_self",
            message:
              "You cannot message yourself. Assign work or reply in chat.",
          };
        }
        if (space && !deps.mountedAgentIds.has(agentId)) {
          return {
            ok: false as const,
            code: "not_mounted",
            message: `${agentId} is not mounted in this Space. Call registry_agents_list and message an id from that list — or hire with agent_propose first.`,
          };
        }
        return null;
      };
      const namedIds = parsed.agent_ids
        ? [...new Set(parsed.agent_ids.map((id) => id.trim()))]
        : null;
      if (namedIds) {
        for (const id of namedIds) {
          const refused = gate(id);
          if (refused) {
            return refused as never;
          }
        }
      }
      if (parsed.room_id?.trim()) {
        // A named room is the room the person meant. `agent_ids` would open a
        // second one beside it.
        return (await messageExistingRoom(deps, {
          ids: namedIds,
          message,
          roomId: parsed.room_id.trim(),
          spaceId: space?.spaceId ?? null,
        })) as never;
      }
      if (namedIds) {
        const ids = namedIds;
        // `mode` does not apply: several colleagues talk in a room, never
        // in an awaited child run.
        return (await messageRoom(deps, {
          ids,
          message,
          purpose: parsed.purpose?.trim() || null,
          spaceId: space?.spaceId ?? null,
          title: parsed.title?.trim() || null,
          visibility: parsed.visibility ?? "private",
        })) as never;
      }
      const agentId = parsed.agent_id?.trim() ?? "";
      if (!agentId) {
        return {
          ok: false as const,
          code: "invalid_agent",
          message: "agent_id is required.",
        } as never;
      }
      const refused = gate(agentId);
      if (refused) {
        return refused as never;
      }
      const toolCallId =
        (ctx as { agent?: { toolCallId?: string } })?.agent?.toolCallId ?? "";
      const [target, sender] = await Promise.all([
        deps.registry.getAgentConfig(agentId),
        deps.registry.getAgentConfig(deps.parentAgentId),
      ]);
      const alias = target?.name ?? agentId;
      const senderName = await senderNameFor(deps, sender);
      // The colleague reads this as the user turn of its thread; the header
      // says who is speaking, since the row itself is attributed to the person
      // whose room it is — and the transcript draws it as "Message from …".
      const brief = `${formatAgentMessageHeader(senderName, deps.parentAgentId)}${message}`;
      const spaceId = space?.spaceId ?? null;
      // In a room the colleague is a member of, the message IS the room's
      // next row — no pair thread, no desk marker pointing elsewhere.
      const inCurrentRoom =
        mode === "notify" && (await isRoomMember(deps, agentId));
      // Where the two talk: one thread per pair in this Space, either
      // direction, either mode, kept for good — so the colleague answers with
      // everything the pair has said before. Without a Space (a tenant-global
      // run) an ask gets a throwaway thread; notify has nowhere to go. The
      // owner is the PERSON behind the run when there is one: a room turn
      // runs as the AI service, whose id is a credential, not a user row.
      const pairThread =
        spaceId && !inCurrentRoom
          ? await resolveAgentPairThread({
              colleagueId: agentId,
              colleagueName: alias,
              ownerUserId: scopeAttributionUserId(deps.scope),
              senderId: deps.parentAgentId,
              senderName,
              spaceId,
              store: deps.store,
              tenantId: deps.scope.tenantId,
            })
          : null;
      const pairThreadId = pairThread?.id ?? null;
      if (pairThread && spaceId) {
        // The colleague's desk gets the "Message from …" line now, before the
        // answer: the person watching that desk sees the message arrive.
        await markDeskRoom(deps, {
          agentId,
          agentName: alias,
          fromId: deps.parentAgentId,
          fromName: senderName,
          message,
          pairThread,
          spaceId,
        });
        // …and the person who was not watching learns it happened.
        await announceAgentMessage(deps, {
          from: displayName(senderName, deps.parentAgentId),
          fromId: deps.parentAgentId,
          pairThread,
          spaceId,
          to: displayName(alias, agentId),
          verb: "handoff",
        });
      }
      let result: Record<string, unknown>;
      if (mode === "notify") {
        if (!spaceId) {
          return {
            ok: false as const,
            code: "no_room",
            message:
              'notify needs a Space: agents talk per Space. Use mode "ask" here.',
          } as never;
        }
        // The room the hand-off lands in: the sender's own room when the
        // colleague is a member of it (a group), else the pair's. Either way
        // the message is a row there and the colleague takes the next turn.
        const roomId = inCurrentRoom ? deps.parentThreadId : pairThreadId;
        if (!roomId) {
          return {
            ok: false as const,
            code: "no_room",
            message: "No room to hand this over in.",
          } as never;
        }
        const delivered = await deliverToRoom({
          from: {
            agentId: deps.parentAgentId,
            ...(await alterEgoFor(deps, roomId).then((alterEgo) =>
              alterEgo ? { alterEgo } : {}
            )),
            name: senderName,
          },
          mentions: [agentId],
          modelConfig: deps.modelConfig ?? null,
          registry: deps.registry,
          roomId,
          runStore: deps.runStore ?? null,
          store: deps.store,
          tenantId: deps.scope.tenantId,
          text: message,
        });
        if (!delivered.ok) {
          return {
            ok: false as const,
            code: delivered.code,
            message: delivered.message,
          } as never;
        }
        result = {
          agent: alias,
          child_thread_id: roomId,
          mode: "notify",
          ok: true,
          result: `Posted in ${roomId === pairThreadId ? "your room with" : "this room for"} ${alias}; it takes the next turn there. Its answer lands in that room — agent_status shows how it went.`,
          room_thread_id: roomId,
        };
      } else {
        result = await runDelegatedSpecialist(deps, {
          agentId,
          alias,
          brief,
          context: ctx as ToolRequestContextCarrier<ToolApprovalSuspendPayload>,
          toolCallId,
          toolName: MESSAGE_AGENT_TOOL_ID,
          ...(pairThreadId ? { childThreadId: pairThreadId } : {}),
        });
        if (result.ok === true && pairThread && spaceId) {
          // The desk that received "Message from …" now shows what its
          // agent answered, cut to a preview, before the inbox hears of it.
          await markDeskReplyPreview(deps, {
            agentId,
            agentName: alias,
            artifactIds: readArtifactIds(result.artifact_ids),
            fromId: deps.parentAgentId,
            pairThread,
            reply: result.result,
            spaceId,
          });
          await announceAgentMessage(deps, {
            from: displayName(alias, agentId),
            fromId: agentId,
            pairThread,
            spaceId,
            to: displayName(senderName, deps.parentAgentId),
            verb: "reply",
          });
        }
      }
      // Who was messaged, for the transcript's one-line hand-off row — the
      // display name and mascot ride the result so a reload needs no lookup.
      return {
        ...result,
        agent_engenty: resolveAgentEngenty(agentId, target?.engenty),
        agent_id: agentId,
        // Where the pair thread lives, so the hand-off row links to it from
        // a page outside that Space (the copilot's own page has none).
        ...(pairThread
          ? { room_host_agent_id: pairThread.agentId, space_id: spaceId }
          : {}),
      } as never;
    },
  });
}

/**
 * `agent_ids`: post to a room with all of them. The room the sender runs in
 * when it is a group (two or more agents, not a pair room — a pair room is
 * per pair and read-only for people, so it never grows); otherwise a new
 * room hosted by the sender, owned by the person behind the run. A run with
 * nobody behind it (a routine fire) opens no room: a room without an owner
 * keeps no budget.
 */
async function messageRoom(
  deps: DelegationToolDeps & { parentAgentId: string },
  input: {
    ids: string[];
    message: string;
    purpose: string | null;
    spaceId: string | null;
    title: string | null;
    /** Who may read a room this opens; the agent acts for one person, so private. */
    visibility: ThreadVisibility;
  }
): Promise<Record<string, unknown>> {
  if (!input.spaceId) {
    return {
      ok: false as const,
      code: "no_room",
      message: "A room needs a Space: agents talk per Space.",
    };
  }
  const ownerUserId = scopeAttributionUserId(deps.scope);
  const tenantId = deps.scope.tenantId;
  const [sender, ...targets] = await Promise.all([
    deps.registry.getAgentConfig(deps.parentAgentId),
    ...input.ids.map((id) => deps.registry.getAgentConfig(id)),
  ]);
  const senderName = await senderNameFor(deps, sender);
  const members = input.ids.map((id, index) => {
    const config = targets[index];
    return {
      agent_id: id,
      engenty: resolveAgentEngenty(id, config?.engenty),
      name: config?.name ?? id,
    };
  });

  const current = await deps.store.getThread({
    tenantId,
    threadId: deps.parentThreadId,
  });
  const currentMembers = current
    ? await deps.store.listAgentMembers({
        tenantId,
        threadId: deps.parentThreadId,
      })
    : [];
  // The sender's current thread is a room to grow when it was opened as one
  // and the sender speaks there. A desk is not; a pair room never grows.
  const inGroupRoom =
    current !== null &&
    isRoomThread(current.route_context) &&
    current.route_context.delegated !== true &&
    currentMembers.some((member) => member.agent_id === deps.parentAgentId);

  let room: ThreadRow;
  let opened = false;
  if (inGroupRoom && current) {
    const present = new Set(currentMembers.map((member) => member.agent_id));
    const missing = input.ids.filter((id) => !present.has(id));
    if (present.size + missing.length > ROOM_MAX_AGENTS) {
      return {
        ok: false as const,
        code: "room_full",
        message: `This room holds ${ROOM_MAX_AGENTS} agents at most; ${present.size} are in it. Message fewer, or open a new room from a desk.`,
      };
    }
    for (const agentId of missing) {
      await deps.store.addAgentMember({
        agentId,
        tenantId,
        threadId: current.id,
      });
    }
    room = current;
    // A purpose offered for a room that has none yet is kept; one that is
    // already set is the people's to change.
    if (input.purpose && !readRoomPurpose(current.metadata) && ownerUserId) {
      const merged = await deps.store.mergeThreadMetadataForUser({
        patch: { [ROOM_PURPOSE_KEY]: input.purpose },
        tenantId,
        threadId: current.id,
        userId: current.created_by_user_id ?? ownerUserId,
      });
      room = merged.thread ?? current;
    }
  } else {
    if (!ownerUserId) {
      return {
        ok: false as const,
        code: "no_person",
        message:
          "Opening a room needs a person behind this run. Message one colleague at a time with agent_id.",
      };
    }
    const title =
      input.title ??
      [senderName, ...members.map((member) => member.name)].join(" & ");
    const created = await deps.store.createThread({
      agentId: deps.parentAgentId,
      createdByUserId: ownerUserId,
      metadata: {
        source: "agent-room",
        ...(input.purpose ? { [ROOM_PURPOSE_KEY]: input.purpose } : {}),
      },
      routeContext: { [THREAD_ROOM_KEY]: true },
      spaceId: input.spaceId,
      status: "idle",
      tenantId,
      title: title.slice(0, 200),
      visibility: input.visibility,
    });
    room = created.thread;
    opened = true;
    for (const agentId of input.ids) {
      await deps.store.addAgentMember({ agentId, tenantId, threadId: room.id });
    }
    const memberNames = members
      .map((member) => displayName(member.name, member.agent_id))
      .filter((name): name is string => name !== null);
    await announceAgentMessage(deps, {
      from: displayName(senderName, deps.parentAgentId),
      fromId: deps.parentAgentId,
      pairThread: { agentId: deps.parentAgentId, id: room.id },
      // A room has its own page; the row opens it, not the host's desk.
      roomThreadId: room.id,
      spaceId: input.spaceId,
      to:
        memberNames.length === members.length && memberNames.length > 0
          ? memberNames.join(", ")
          : null,
      verb: "handoff",
    });
  }
  const delivered = await deliverToRoom({
    from: {
      agentId: deps.parentAgentId,
      ...(await alterEgoFor(deps, room.id).then((alterEgo) =>
        alterEgo ? { alterEgo } : {}
      )),
      name: senderName,
    },
    mentions: input.ids,
    modelConfig: deps.modelConfig ?? null,
    registry: deps.registry,
    roomId: room.id,
    runStore: deps.runStore ?? null,
    store: deps.store,
    tenantId,
    text: input.message,
  });
  if (!delivered.ok) {
    return {
      ok: false as const,
      code: delivered.code,
      message: delivered.message,
    };
  }
  const names = members.map((member) => member.name).join(", ");
  return {
    // The card and the thread summary read these two the way they do for
    // a single colleague.
    agent_id: deps.parentAgentId,
    child_thread_id: room.id,
    members,
    mode: "room",
    ok: true,
    opened,
    purpose: readRoomPurpose(room.metadata) ?? input.purpose,
    result: opened
      ? `Opened the room "${room.title ?? ""}" with ${names}; each takes a turn there, in that order. Their answers land in the room — agent_status shows how it went.`
      : `Posted in this room for ${names}; each takes a turn, in that order.`,
    room_host_agent_id: room.agent_id,
    room_thread_id: room.id,
    title: room.title,
    visibility: room.visibility,
  };
}

/**
 * `room_id`: post in a room that already exists.
 *
 * `agent_ids` addresses a room by its member set, and from a desk that always
 * means a NEW one — so a room the person named (an `@`-mention carries its
 * thread id) had no way to be spoken in, and the agent opened a second room
 * beside it. Here the room IS the id: with nobody singled out every agent in
 * it takes a turn, in order; `agent_ids` narrows that to the members named.
 *
 * Membership, the turn budget and the pause are `deliverToRoom`'s to enforce
 * — this only refuses what it alone can see: a thread that is not a room of
 * this Space.
 */
async function messageExistingRoom(
  deps: DelegationToolDeps & { parentAgentId: string },
  input: {
    /** Members to wake, or null for everyone in the room. */
    ids: string[] | null;
    message: string;
    roomId: string;
    spaceId: string | null;
  }
): Promise<Record<string, unknown>> {
  const tenantId = deps.scope.tenantId;
  const room = await deps.store.getThread({
    tenantId,
    threadId: input.roomId,
  });
  // A pair thread is a room in shape only: it is per pair, read-only for
  // people, and grows for nobody — `agent_id` is how those are spoken in.
  if (
    !(room && isRoomThread(room.route_context)) ||
    room.route_context?.delegated === true
  ) {
    return {
      ok: false as const,
      code: "no_room",
      message:
        "No room with that id. Pass the id of a room in this Space, or use agent_ids to open a new one.",
    };
  }
  if (input.spaceId && room.space_id !== input.spaceId) {
    return {
      ok: false as const,
      code: "no_room",
      message: "That room belongs to another Space.",
    };
  }
  const memberRows = await deps.store.listAgentMembers({
    tenantId,
    threadId: input.roomId,
  });
  const memberIds = [
    ...new Set([room.agent_id, ...memberRows.map((member) => member.agent_id)]),
  ];
  const mentions = (input.ids ?? memberIds).filter(
    (id) => id !== deps.parentAgentId
  );
  if (mentions.length === 0) {
    return {
      ok: false as const,
      code: "no_addressee",
      message:
        "You are the only agent in that room. Add colleagues with agent_ids, or answer here.",
    };
  }
  const sender = await deps.registry.getAgentConfig(deps.parentAgentId);
  const senderName = await senderNameFor(deps, sender);
  const delivered = await deliverToRoom({
    from: {
      agentId: deps.parentAgentId,
      ...(await alterEgoFor(deps, room.id).then((alterEgo) =>
        alterEgo ? { alterEgo } : {}
      )),
      name: senderName,
    },
    mentions,
    modelConfig: deps.modelConfig ?? null,
    registry: deps.registry,
    roomId: room.id,
    runStore: deps.runStore ?? null,
    store: deps.store,
    tenantId,
    text: input.message,
  });
  if (!delivered.ok) {
    return {
      ok: false as const,
      code: delivered.code,
      message: delivered.message,
    };
  }
  const members = await Promise.all(
    delivered.addressed.map(async (id) => {
      const config = await deps.registry.getAgentConfig(id);
      return {
        agent_id: id,
        engenty: resolveAgentEngenty(id, config?.engenty),
        name: config?.name ?? id,
      };
    })
  );
  const names = members.map((member) => member.name).join(", ");
  return {
    // The transcript's room row reads these the way it does for a new room.
    agent_id: deps.parentAgentId,
    child_thread_id: room.id,
    members,
    mode: "room",
    ok: true,
    opened: false,
    purpose: readRoomPurpose(room.metadata),
    result: `Posted in "${room.title ?? "the room"}" for ${names}; each takes a turn there, in that order. Their answers stay in that room — agent_status shows how it went.`,
    room_host_agent_id: room.agent_id,
    room_thread_id: room.id,
    title: room.title,
    visibility: room.visibility,
  };
}

/** The delegate result's `artifact_ids`, as strings only. */
function readArtifactIds(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((id): id is string => typeof id === "string" && id !== "")
    : [];
}

/** Whether the colleague may speak in the sender's current room. */
async function isRoomMember(
  deps: DelegationToolDeps,
  agentId: string
): Promise<boolean> {
  const members = await deps.store.listAgentMembers({
    tenantId: deps.scope.tenantId,
    threadId: deps.parentThreadId,
  });
  return members.some((member) => member.agent_id === agentId);
}

const ANNOUNCE_WINDOW_MS = 10 * 60 * 1000;

/**
 * A name fit for a notification: the display name when the registry had one,
 * null when all that is known is the id (the lookups fall back to it).
 */
function displayName(
  name: string | null | undefined,
  id: string
): string | null {
  const trimmed = name?.trim();
  return trimmed && trimmed !== id ? trimmed : null;
}

/**
 * An `update` for the person: agents talked and they were not watching.
 * One row per sender + space within a window, ×N — a busy pair does not
 * flood the inbox. Opening the pair thread marks it seen (read-sync in the
 * thread messages route). Never throws: the message already went through.
 */
async function announceAgentMessage(
  deps: DelegationToolDeps,
  input: {
    /** The sender's display name; null when only its id is known. */
    from: string | null;
    fromId: string;
    pairThread: { agentId: string; id: string };
    /** Set when the exchange lives in a room: the row opens the room page. */
    roomThreadId?: string | null;
    spaceId: string;
    /** The receiver's display name(s); null when only an id is known. */
    to: string | null;
    verb: "handoff" | "reply";
  }
): Promise<void> {
  // Told to the person behind the run; a service run has nobody to tell.
  const userId = scopeAttributionUserId(deps.scope);
  if (!userId) {
    return;
  }
  await emitInboxNotification({
    actor: { id: input.fromId, kind: "agent" },
    coalesceKey: `agent:${input.fromId}:agent_message_received:${input.spaceId}`,
    coalesceWindowMs: ANNOUNCE_WINDOW_MS,
    kind: "agent_message_received",
    metadata: {
      from_agent_id: input.fromId,
      ...(input.roomThreadId ? { room_thread_id: input.roomThreadId } : {}),
      thread_agent_id: input.pairThread.agentId,
      thread_id: input.pairThread.id,
    },
    priority: "low",
    source: "agents",
    spaceId: input.spaceId,
    subject: { id: input.pairThread.id, type: "thread" },
    // Fallback only, said whole when a name is missing — never an agent id.
    summary:
      input.verb === "reply"
        ? `${input.from ?? "An agent"} replied`
        : `${input.from ?? "An agent"} handed work to a colleague`,
    tenantId: deps.scope.tenantId,
    ...(input.from && input.to
      ? {
          title: {
            key: input.verb === "reply" ? "agent_reply" : "agent_handoff",
            params: { from: input.from, to: input.to },
          },
        }
      : {}),
    userId,
  });
}

/**
 * Put a "Message from …" row into an agent's desk room: the sender header
 * plus the whole message, pointing at the pair thread where the exchange
 * lives. The whole message, not a preview: the person reads the desk and
 * answers there, and that answer's run reads this row as the brief — a cut
 * brief was answered as a cut brief. Skipped when the run has no person (a
 * routine fire) — there is no room to mark. Its own failure is logged, never
 * raised: the message itself went through.
 */
async function markDeskRoom(
  deps: DelegationToolDeps,
  input: {
    /** Whose desk room. */
    agentId: string;
    agentName: string;
    fromId: string;
    fromName: string;
    message: string;
    pairThread: { agentId: string; id: string };
    spaceId: string;
  }
): Promise<void> {
  try {
    const roomThreadId = await resolveSpecialistChatThread({
      agentId: input.agentId,
      ownerUserId: scopeAttributionUserId(deps.scope),
      spaceId: input.spaceId,
      store: deps.store,
      tenantId: deps.scope.tenantId,
      threadSeed: `agent-room:${input.spaceId}:${input.agentId}:${scopeAttributionUserId(deps.scope) ?? "service"}`,
      title: input.agentName,
    });
    if (!roomThreadId) {
      return;
    }
    const text = `${formatAgentMessageHeader(input.fromName, input.fromId)}${input.message.trim()}`;
    const marker: AgentMessageMarker = {
      agent_id: input.fromId,
      thread_agent_id: input.pairThread.agentId,
      thread_id: input.pairThread.id,
    };
    await deps.store.appendMessage({
      authorUserId: scopeAttributionUserId(deps.scope),
      metadata: { [AGENT_MESSAGE_MARKER_KEY]: marker },
      parts: [{ text, type: "text" }],
      role: "user",
      tenantId: deps.scope.tenantId,
      threadId: roomThreadId,
    });
  } catch (error) {
    logger.warn("desk room marker failed", {
      agentId: input.agentId,
      error: error instanceof Error ? error.message : String(error),
      threadId: input.pairThread.id,
    });
  }
}
