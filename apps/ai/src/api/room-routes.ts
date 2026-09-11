// Rooms and direct messages over HTTP — the conversations a Space's sidebar
// lists besides the desks (PLAN-agent-rooms.md §10).
//
// A room is a thread opened as one (`route_context.room`): who is in it
// (agents and people), put someone in, take someone out, join one yourself,
// open a new one, say what it is for, who may see it, and lift a pause.
// Agent membership is `ai.thread_agent` (R1); the host stays the thread's
// `agent_id`. People are `ai.thread_participant`; the owner stays. The
// purpose lives in the thread's metadata (rooms/room-turns.ts).
//
// A DM (`route_context.dm`) is one person's private line with one agent in a
// Space: one per person, agent and Space, a stable id, opened on first use
// and returned as-is after that. It is never named and never listed empty.
//
// Access is the thread's: whoever may write a room may change it.
import type { HonoBindings, HonoVariables } from "@mastra/hono";
import type { Hono } from "hono";
import { z } from "zod";
import { AiSessionError } from "../ai/errors.js";
import type { AiRegistry, AiService } from "../ai/index.js";
import {
  HUMAN_TURN_ROOM_PATCH,
  ROOM_MAX_AGENTS,
  ROOM_MIN_AGENTS,
  ROOM_PURPOSE_KEY,
  ROOM_PURPOSE_MAX_CHARS,
} from "../ai/rooms/room-turns.js";
import {
  canEnterSpaceDefault,
  requireStoredThreadAccess,
} from "../ai/sessions/thread-access.js";
import { resolveUserDisplayNames } from "../ai/sessions/user-display-names.js";
import { stableUuid } from "../ai/workflows/dispatch-published-run.js";
import { AI_BASE_PATH } from "../config/constants.js";
import type { ThreadStore } from "../dal/threads/index.js";
import { preservedThreadUpsertFields } from "../dal/threads/thread-upsert-preserve.js";
import {
  THREAD_DM_KEY,
  THREAD_ROOM_KEY,
  type ThreadRow,
  type ThreadVisibility,
} from "../dal/threads/types.js";
import type { AiScopeResolver } from "./http.js";
import { handleRouteError, resolveScope } from "./http.js";

const uuidString = z.string().uuid();
const agentIdString = z.string().min(1).max(128);
const purposeString = z.string().trim().max(ROOM_PURPOSE_MAX_CHARS);
const visibilityString = z.enum(["private", "space"]);

const createRoomBodySchema = z.object({
  /** The first hosts the room — it is listed on that desk. */
  agent_ids: z
    .array(agentIdString)
    .min(ROOM_MIN_AGENTS)
    .max(ROOM_MAX_AGENTS)
    .refine((ids) => new Set(ids).size === ids.length, "duplicate agent"),
  purpose: purposeString.optional(),
  space_id: uuidString,
  title: z.string().trim().min(1).max(200),
  /** Default `space`: a room is a shared outcome. */
  visibility: visibilityString.default("space"),
});

const updateRoomBodySchema = z
  .object({
    /** Empty clears it. */
    purpose: purposeString.optional(),
    title: z.string().trim().min(1).max(200).optional(),
    visibility: visibilityString.optional(),
  })
  .refine(
    (body) =>
      body.purpose !== undefined ||
      body.title !== undefined ||
      body.visibility !== undefined,
    "nothing to change"
  );

const addMemberBodySchema = z.object({ agent_id: agentIdString });
const addPersonBodySchema = z.object({ user_id: uuidString });
const openDmBodySchema = z.object({
  agent_id: agentIdString,
  space_id: uuidString,
});

/** The one DM a person has with an agent in a Space — the same id every time. */
export function dmThreadId(input: {
  agentId: string;
  spaceId: string;
  tenantId: string;
  userId: string;
}): string {
  return stableUuid(
    `dm:${input.tenantId}:${input.spaceId}:${input.agentId}:${input.userId}`
  );
}

export function registerRoomRoutes(
  app: Hono<{ Bindings: HonoBindings; Variables: HonoVariables }>,
  opts: {
    aiService: AiService;
    /** For the agent behind a DM: it must exist and be a shared specialist. */
    getRegistry?: (tenantId: string) => AiRegistry;
    scopeResolver: AiScopeResolver;
    store: ThreadStore;
  }
): void {
  const base = `${AI_BASE_PATH}/threads`;
  const { store } = opts;

  const listPeople = async (tenantId: string, threadId: string) => {
    const people = await store.listUserParticipants({ tenantId, threadId });
    const names = await resolveUserDisplayNames(
      people.map((person) => person.user_id)
    );
    return people.map((person) => ({
      ...person,
      name: names.get(person.user_id) ?? null,
    }));
  };

  /** The purpose merge is owner-keyed, like every metadata merge. */
  const writePurpose = async (room: ThreadRow, purpose: string) => {
    if (!room.created_by_user_id) {
      throw new AiSessionError("agent_threads.notFound");
    }
    const { thread } = await store.mergeThreadMetadataForUser({
      tenantId: room.tenant_id,
      threadId: room.id,
      userId: room.created_by_user_id,
      ...(purpose
        ? { patch: { [ROOM_PURPOSE_KEY]: purpose } }
        : { removeKeys: [ROOM_PURPOSE_KEY] }),
    });
    if (!thread) {
      throw new AiSessionError("agent_threads.notFound");
    }
    return thread;
  };

  // What one person's sidebar lists in a Space besides the desks: the rooms
  // they are in and their DMs. Rooms they may read but never joined are the
  // directory's.
  app.get(`${AI_BASE_PATH}/spaces/:spaceId/conversations`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const spaceId = c.req.param("spaceId");
    if (!uuidString.safeParse(spaceId).success) {
      return c.json({ error: "agent_threads.invalidBody" }, 400);
    }
    try {
      if (!(await canEnterSpaceDefault(scope.scope, spaceId))) {
        return c.json({ error: "agent_threads.forbidden" }, 403);
      }
      const tenantId = scope.scope.tenantId;
      const [rooms, dms] = await Promise.all([
        store.listRoomsForSpace({
          spaceId,
          tenantId,
          viewerUserId: scope.scope.userId,
        }),
        store.listDmsForUser({ spaceId, tenantId, userId: scope.scope.userId }),
      ]);
      return c.json({
        dms: dms.map((thread) => ({
          agent_id: thread.agent_id,
          session: thread,
        })),
        rooms: rooms.map((room) => ({
          members: room.members,
          session: room.thread,
        })),
      });
    } catch (err) {
      return handleRouteError(
        c,
        "space conversations failed",
        "agent_threads.listSessionsFailed",
        err
      );
    }
  });

  // Every room a person may read in the Space, with whether they are in it.
  app.get(`${AI_BASE_PATH}/spaces/:spaceId/rooms/directory`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const spaceId = c.req.param("spaceId");
    if (!uuidString.safeParse(spaceId).success) {
      return c.json({ error: "agent_threads.invalidBody" }, 400);
    }
    try {
      if (!(await canEnterSpaceDefault(scope.scope, spaceId))) {
        return c.json({ error: "agent_threads.forbidden" }, 403);
      }
      const rooms = await store.listSpaceRoomsDirectory({
        spaceId,
        tenantId: scope.scope.tenantId,
        viewerUserId: scope.scope.userId,
      });
      return c.json({
        rooms: rooms.map((room) => ({
          joined: room.joined,
          members: room.members,
          session: room.thread,
        })),
      });
    } catch (err) {
      return handleRouteError(
        c,
        "room directory failed",
        "agent_threads.listSessionsFailed",
        err
      );
    }
  });

  // Open (or return) the caller's DM with an agent. Idempotent: the id is a
  // function of person, agent and Space, so a second call — or one after the
  // DM was archived — lands on the same row and brings it back.
  app.post(`${base}/dm`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const body = openDmBodySchema.safeParse(await c.req.json());
    if (!body.success) {
      return c.json({ error: "agent_threads.invalidBody" }, 400);
    }
    const { agent_id: agentId, space_id: spaceId } = body.data;
    try {
      if (!(await canEnterSpaceDefault(scope.scope, spaceId))) {
        return c.json({ error: "agent_threads.forbidden" }, 403);
      }
      const tenantId = scope.scope.tenantId;
      const config = await opts.getRegistry?.(tenantId).getAgentConfig(agentId);
      if (opts.getRegistry && !config) {
        return c.json({ error: "agent_threads.notFound" }, 404);
      }
      // A personal agent's every thread is one person's already; a DM adds
      // nothing to it and would list twice.
      if (config?.agentScope === "personal") {
        return c.json({ error: "agent_threads.noDm" }, 422);
      }
      const threadId = dmThreadId({
        agentId,
        spaceId,
        tenantId,
        userId: scope.scope.userId,
      });
      const existing = await store.getThread({ tenantId, threadId });
      if (existing && !existing.archived_at) {
        return c.json({ created: false, session: existing });
      }
      const preserved = await preservedThreadUpsertFields({
        metadata: { source: "dm" },
        store,
        tenantId,
        threadId,
      });
      const { thread } = await store.upsertThread({
        agentId,
        createdByUserId: scope.scope.userId,
        id: threadId,
        ...preserved,
        routeContext: { [THREAD_DM_KEY]: true },
        spaceId,
        status: "idle",
        tenantId,
        title: null,
        visibility: "private",
      });
      return c.json({ created: true, session: thread }, 201);
    } catch (err) {
      return handleRouteError(
        c,
        "open dm failed",
        "agent_threads.createFailed",
        err
      );
    }
  });

  // Join a room yourself. Only a Space-visible room is open to walk into; a
  // private one is by invitation (`POST …/people`), and a pair room or a DM
  // takes nobody.
  app.post(`${base}/:threadId/join`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const threadId = c.req.param("threadId");
    if (!uuidString.safeParse(threadId).success) {
      return c.json({ error: "agent_threads.invalidThreadId" }, 400);
    }
    try {
      const tenantId = scope.scope.tenantId;
      const thread = await store.getThread({ tenantId, threadId });
      if (!thread) {
        throw new AiSessionError("agent_threads.notFound");
      }
      if (
        thread.route_context[THREAD_ROOM_KEY] !== true ||
        thread.route_context.delegated === true ||
        thread.route_context[THREAD_DM_KEY] === true
      ) {
        return c.json({ error: "agent_threads.agentsOnly" }, 422);
      }
      if (thread.visibility !== "space") {
        return c.json({ error: "agent_threads.forbidden" }, 403);
      }
      if (
        !(
          thread.space_id &&
          (await canEnterSpaceDefault(scope.scope, thread.space_id))
        )
      ) {
        return c.json({ error: "agent_threads.forbidden" }, 403);
      }
      await store.addUserParticipant({
        tenantId,
        threadId,
        userId: scope.scope.userId,
      });
      return c.json({ people: await listPeople(tenantId, threadId) });
    } catch (err) {
      return handleRouteError(
        c,
        "join room failed",
        "agent_threads.updateFailed",
        err
      );
    }
  });

  app.post(`${base}/rooms`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const body = createRoomBodySchema.safeParse(await c.req.json());
    if (!body.success) {
      return c.json({ error: "agent_threads.invalidBody" }, 400);
    }
    try {
      const [host, ...members] = body.data.agent_ids;
      const created = await opts.aiService.threads.createThread({
        agentId: host as string,
        routeContext: { [THREAD_ROOM_KEY]: true },
        scope: scope.scope,
        spaceId: body.data.space_id,
        title: body.data.title,
      });
      let thread = created.thread;
      if (body.data.visibility !== thread.visibility) {
        thread = await store.setThreadVisibility({
          tenantId: scope.scope.tenantId,
          threadId: thread.id,
          visibility: body.data.visibility,
        });
      }
      for (const agentId of members) {
        await store.addAgentMember({
          agentId,
          tenantId: scope.scope.tenantId,
          threadId: thread.id,
        });
      }
      if (body.data.purpose) {
        thread = await writePurpose(thread, body.data.purpose);
      }
      return c.json(
        {
          members: await store.listAgentMembers({
            tenantId: scope.scope.tenantId,
            threadId: thread.id,
          }),
          session: thread,
        },
        201
      );
    } catch (err) {
      return handleRouteError(
        c,
        "createRoom failed",
        "agent_threads.createFailed",
        err
      );
    }
  });

  app.patch(`${base}/:threadId/room`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const threadId = c.req.param("threadId");
    if (!uuidString.safeParse(threadId).success) {
      return c.json({ error: "agent_threads.invalidThreadId" }, 400);
    }
    const body = updateRoomBodySchema.safeParse(await c.req.json());
    if (!body.success) {
      return c.json({ error: "agent_threads.invalidBody" }, 400);
    }
    try {
      await requireStoredThreadAccess({
        action: "write",
        agentId: "",
        scope: scope.scope,
        store,
        threadId,
      });
      const tenantId = scope.scope.tenantId;
      let room = await store.getThread({ tenantId, threadId });
      if (!room) {
        throw new AiSessionError("agent_threads.notFound");
      }
      if (body.data.title !== undefined) {
        room = (
          await opts.aiService.threads.updateThread({
            scope: scope.scope,
            threadId,
            title: body.data.title,
          })
        ).thread;
      }
      if (body.data.purpose !== undefined) {
        room = await writePurpose(room, body.data.purpose);
      }
      if (
        body.data.visibility !== undefined &&
        body.data.visibility !== room.visibility
      ) {
        room = await store.setThreadVisibility({
          tenantId,
          threadId,
          visibility: body.data.visibility as ThreadVisibility,
        });
      }
      return c.json({ session: room });
    } catch (err) {
      return handleRouteError(
        c,
        "update room failed",
        "agent_threads.updateFailed",
        err
      );
    }
  });

  app.get(`${base}/:threadId/agents`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const threadId = c.req.param("threadId");
    if (!uuidString.safeParse(threadId).success) {
      return c.json({ error: "agent_threads.invalidThreadId" }, 400);
    }
    try {
      // `getThread` is the read gate.
      await opts.aiService.threads.getThread({ scope: scope.scope, threadId });
      return c.json({
        members: await store.listAgentMembers({
          tenantId: scope.scope.tenantId,
          threadId,
        }),
      });
    } catch (err) {
      return handleRouteError(
        c,
        "room members failed",
        "agent_threads.notFound",
        err
      );
    }
  });

  app.post(`${base}/:threadId/agents`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const threadId = c.req.param("threadId");
    if (!uuidString.safeParse(threadId).success) {
      return c.json({ error: "agent_threads.invalidThreadId" }, 400);
    }
    const body = addMemberBodySchema.safeParse(await c.req.json());
    if (!body.success) {
      return c.json({ error: "agent_threads.invalidBody" }, 400);
    }
    try {
      await requireStoredThreadAccess({
        action: "write",
        agentId: body.data.agent_id,
        scope: scope.scope,
        store,
        threadId,
      });
      const tenantId = scope.scope.tenantId;
      const current = await store.listAgentMembers({ tenantId, threadId });
      if (
        current.length >= ROOM_MAX_AGENTS &&
        !current.some((member) => member.agent_id === body.data.agent_id)
      ) {
        return c.json(
          { error: "agent_threads.roomFull", max: ROOM_MAX_AGENTS },
          422
        );
      }
      await store.addAgentMember({
        agentId: body.data.agent_id,
        tenantId,
        threadId,
      });
      return c.json({
        members: await store.listAgentMembers({ tenantId, threadId }),
      });
    } catch (err) {
      return handleRouteError(
        c,
        "add room member failed",
        "agent_threads.updateFailed",
        err
      );
    }
  });

  app.delete(`${base}/:threadId/agents/:agentId`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const threadId = c.req.param("threadId");
    const agentId = c.req.param("agentId");
    if (!uuidString.safeParse(threadId).success) {
      return c.json({ error: "agent_threads.invalidThreadId" }, 400);
    }
    try {
      await requireStoredThreadAccess({
        action: "write",
        agentId,
        scope: scope.scope,
        store,
        threadId,
      });
      const tenantId = scope.scope.tenantId;
      const thread = await store.getThread({ tenantId, threadId });
      if (!thread) {
        throw new AiSessionError("agent_threads.notFound");
      }
      if (thread.agent_id === agentId) {
        return c.json({ error: "agent_threads.hostStays" }, 422);
      }
      await store.removeAgentMember({ agentId, tenantId, threadId });
      return c.json({
        members: await store.listAgentMembers({ tenantId, threadId }),
      });
    } catch (err) {
      return handleRouteError(
        c,
        "remove room member failed",
        "agent_threads.updateFailed",
        err
      );
    }
  });

  // People in the room. A pair room (`delegated`) is agents-only: people
  // read it, nobody posts into it.
  app.get(`${base}/:threadId/people`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const threadId = c.req.param("threadId");
    if (!uuidString.safeParse(threadId).success) {
      return c.json({ error: "agent_threads.invalidThreadId" }, 400);
    }
    try {
      await opts.aiService.threads.getThread({ scope: scope.scope, threadId });
      return c.json({
        people: await listPeople(scope.scope.tenantId, threadId),
      });
    } catch (err) {
      return handleRouteError(
        c,
        "room people failed",
        "agent_threads.notFound",
        err
      );
    }
  });

  app.post(`${base}/:threadId/people`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const threadId = c.req.param("threadId");
    if (!uuidString.safeParse(threadId).success) {
      return c.json({ error: "agent_threads.invalidThreadId" }, 400);
    }
    const body = addPersonBodySchema.safeParse(await c.req.json());
    if (!body.success) {
      return c.json({ error: "agent_threads.invalidBody" }, 400);
    }
    try {
      await requireStoredThreadAccess({
        action: "write",
        agentId: "",
        scope: scope.scope,
        store,
        threadId,
      });
      const tenantId = scope.scope.tenantId;
      const thread = await store.getThread({ tenantId, threadId });
      if (!thread) {
        throw new AiSessionError("agent_threads.notFound");
      }
      if (thread.route_context.delegated === true) {
        return c.json({ error: "agent_threads.agentsOnly" }, 422);
      }
      await store.addUserParticipant({
        tenantId,
        threadId,
        userId: body.data.user_id,
      });
      return c.json({ people: await listPeople(tenantId, threadId) });
    } catch (err) {
      return handleRouteError(
        c,
        "add room person failed",
        "agent_threads.updateFailed",
        err
      );
    }
  });

  app.delete(`${base}/:threadId/people/:userId`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const threadId = c.req.param("threadId");
    const userId = c.req.param("userId");
    if (
      !(
        uuidString.safeParse(threadId).success &&
        uuidString.safeParse(userId).success
      )
    ) {
      return c.json({ error: "agent_threads.invalidThreadId" }, 400);
    }
    try {
      await requireStoredThreadAccess({
        action: "write",
        agentId: "",
        scope: scope.scope,
        store,
        threadId,
      });
      const tenantId = scope.scope.tenantId;
      const thread = await store.getThread({ tenantId, threadId });
      if (!thread) {
        throw new AiSessionError("agent_threads.notFound");
      }
      if (thread.created_by_user_id === userId) {
        return c.json({ error: "agent_threads.ownerStays" }, 422);
      }
      await store.removeUserParticipant({ tenantId, threadId, userId });
      return c.json({ people: await listPeople(tenantId, threadId) });
    } catch (err) {
      return handleRouteError(
        c,
        "remove room person failed",
        "agent_threads.updateFailed",
        err
      );
    }
  });

  // A person lifting a pause without saying anything: the same reset a
  // message applies (rooms/room-turns.ts). Owner-keyed like every metadata
  // merge.
  app.post(`${base}/:threadId/continue`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const threadId = c.req.param("threadId");
    if (!uuidString.safeParse(threadId).success) {
      return c.json({ error: "agent_threads.invalidThreadId" }, 400);
    }
    try {
      const { thread } = await store.mergeThreadMetadataForUser({
        patch: HUMAN_TURN_ROOM_PATCH,
        tenantId: scope.scope.tenantId,
        threadId,
        userId: scope.scope.userId,
      });
      if (!thread) {
        throw new AiSessionError("agent_threads.notFound");
      }
      return c.json({ session: thread });
    } catch (err) {
      return handleRouteError(
        c,
        "room continue failed",
        "agent_threads.updateFailed",
        err
      );
    }
  });
}
