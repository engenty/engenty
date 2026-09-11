// Who may read or write a thread. The AI service uses the service-role key, so
// RLS never runs behind it — this helper is the whole boundary.
//
// A thread is a room with members: people in `thread_participant`, agents in
// `thread_agent` (the thread's `agent_id` hosts it). What a PERSON may open is
// decided here, by the room's kind:
// - Personal / Copilot: the owner only.
// - A room of a shared specialist in a space (its desk, an agent pair, a
//   group): anyone who may enter that space — unless the thread is
//   `private`, then only the people in it (`thread_participant`).
// - Task-bound thread (no human owner + route_context.task_id): anyone who
//   may read the task. Read and write use the same rule.
// - Routine run (no human owner + route_context.routine_id): anyone who may
//   enter the Space the fire ran in.
// - Workflow run (no human owner + route_context.workflow_id): the Space when the
//   run has one, the tenant otherwise — the audience the workflow monitor
//   already shows the run to.
// An AGENT's run in a room is started by the platform for a member, never
// requested, so agents do not pass through here.
import {
  EngentyCoreClient,
  getEngentyCoreBaseUrlFromEnv,
} from "../core-http-client.js";
import { AiSessionError } from "../errors.js";
import {
  canReadTaskRunThread,
  routineIdOfRunThread,
  taskIdOfRunThread,
  workflowIdOfRunThread,
} from "./task-thread-access.js";
import { type AiSessionScope, scopeAccessToken } from "./types.js";

export type ThreadAccessAction = "read" | "write";

export interface ThreadAccessShape {
  agent_id: string;
  created_by_user_id: string | null;
  route_context: Record<string, unknown>;
  space_id?: string | null;
  /** Absent reads as `space` — rows older than the column. */
  visibility?: string | null;
}

export interface AgentScopeConfig {
  agentScope?: "personal" | "shared";
}

export interface CanAccessThreadInput {
  action: ThreadAccessAction;
  /**
   * Proof the caller may enter `spaceId`. Defaults to core's space surface
   * (already gated by `requireSpaceAccess`). Injected in tests.
   */
  canEnterSpace?: (spaceId: string) => Promise<boolean>;
  getAgentConfig?: (agentId: string) => Promise<AgentScopeConfig | undefined>;
  /** Whether the caller is one of the people in the thread; a private room asks. */
  isParticipant?: () => Promise<boolean>;
  scope: AiSessionScope;
  session: ThreadAccessShape;
}

/**
 * Shared specialist rooms and task-bound rooms are Space-keyed in Mastra
 * (`resourceId = spaceId`, falling back to `threadId` when the thread has no
 * Space). Copilot stays per-user.
 */
export function isSharedMastraRoom(input: {
  agentScope?: "personal" | "shared" | null;
  session: ThreadAccessShape;
}): boolean {
  // An unattended run's memory belongs to the Space and its specialist, not to
  // whichever principal happened to execute it — a routine fire or a pressed
  // Action runs as the service, so keying on the caller would hand every run
  // a different room.
  if (
    taskIdOfRunThread(input.session) ||
    routineIdOfRunThread(input.session) ||
    workflowIdOfRunThread(input.session)
  ) {
    return true;
  }
  return (
    input.agentScope === "shared" && Boolean(input.session.space_id?.trim())
  );
}

export function sharedMastraRoomFromThread(input: {
  agentId?: string;
  agentScope?: "personal" | "shared" | null;
  thread?: {
    agent_id?: string | null;
    created_by_user_id?: string | null;
    route_context?: Record<string, unknown> | null;
    space_id?: string | null;
  } | null;
}): boolean {
  if (!input.thread) {
    return false;
  }
  return isSharedMastraRoom({
    agentScope: input.agentScope,
    session: {
      agent_id: input.thread.agent_id ?? input.agentId ?? "",
      created_by_user_id: input.thread.created_by_user_id ?? null,
      route_context: input.thread.route_context ?? {},
      space_id: input.thread.space_id ?? null,
    },
  });
}

export async function canEnterSpaceDefault(
  scope: AiSessionScope,
  spaceId: string
): Promise<boolean> {
  const accessToken = scopeAccessToken(scope);
  const coreBaseUrl = getEngentyCoreBaseUrlFromEnv();
  if (!(accessToken && coreBaseUrl)) {
    return false;
  }
  try {
    const client = new EngentyCoreClient({ accessToken, coreBaseUrl });
    await client.getSpaceSurface(spaceId);
    return true;
  } catch {
    return false;
  }
}

export async function canAccessThread(
  input: CanAccessThreadInput
): Promise<boolean> {
  // Platform observers reconstruct prompts on other people's Copilot threads.
  // Write stays owner-or-space: a superadmin listing runs is not a participant.
  if (input.scope.isSuperAdmin === true && input.action === "read") {
    return true;
  }
  if (input.session.created_by_user_id === input.scope.userId) {
    return true;
  }
  if (taskIdOfRunThread(input.session)) {
    return canReadTaskRunThread({
      scope: input.scope,
      session: input.session,
    });
  }
  // A graph run's thread: unattended work, not a private chat. In a Space the
  // Space decides; a tenant-level Action's run is visible to the tenant, the
  // same audience its Actions monitor already shows the run to. This must run
  // before the space guard below or a tenant-level press's transcript would be
  // unreachable even by the person who pressed it.
  if (workflowIdOfRunThread(input.session)) {
    const actionSpaceId = input.session.space_id?.trim();
    if (!actionSpaceId) {
      return true;
    }
    const canEnterActionSpace =
      input.canEnterSpace ??
      ((id: string) => canEnterSpaceDefault(input.scope, id));
    return canEnterActionSpace(actionSpaceId);
  }
  const spaceId = input.session.space_id?.trim();
  if (!spaceId) {
    return false;
  }
  // A routine fire is unattended work in a Space, not a private chat, so the
  // Space decides — the same rule `isSharedMastraRoom` already uses to key its
  // memory. This has to run BEFORE the `agentScope` check below: a hired
  // specialist is a database agent, and `ai.engenty_ai_agents` has no
  // `agent_scope` column, so its config comes back with `agentScope` unset.
  // Without this branch the desk listed a routine's runs (they are in the
  // Space) and then 404'd on opening one.
  if (routineIdOfRunThread(input.session)) {
    const canEnterRoutineSpace =
      input.canEnterSpace ??
      ((id: string) => canEnterSpaceDefault(input.scope, id));
    return canEnterRoutineSpace(spaceId);
  }
  const config = await input.getAgentConfig?.(input.session.agent_id);
  if (config?.agentScope !== "shared") {
    return false;
  }
  // A private room is the people in it, not the Space. The owner passed
  // above; everyone else has to be a participant.
  if (input.session.visibility === "private") {
    return input.isParticipant ? await input.isParticipant() : false;
  }
  const canEnter =
    input.canEnterSpace ??
    ((id: string) => canEnterSpaceDefault(input.scope, id));
  return canEnter(spaceId);
}

export async function requireThreadAccess(
  input: CanAccessThreadInput
): Promise<void> {
  if (!(await canAccessThread(input))) {
    throw new AiSessionError("agent_threads.notFound");
  }
}

export async function requireStoredThreadAccess(input: {
  action: ThreadAccessAction;
  agentId: string;
  getAgentConfig?: CanAccessThreadInput["getAgentConfig"];
  scope: AiSessionScope;
  store: {
    getThread?: (params: { tenantId: string; threadId: string }) => Promise<{
      agent_id?: string | null;
      created_by_user_id?: string | null;
      route_context?: Record<string, unknown> | null;
      space_id?: string | null;
      visibility?: string | null;
    } | null>;
    listUserParticipants?: (params: {
      tenantId: string;
      threadId: string;
    }) => Promise<{ user_id: string }[]>;
  };
  threadId: string;
}): Promise<void> {
  if (typeof input.store.getThread !== "function") {
    return;
  }
  const thread = await input.store.getThread({
    tenantId: input.scope.tenantId,
    threadId: input.threadId,
  });
  if (!thread) {
    throw new AiSessionError("agent_threads.notFound");
  }
  const listUserParticipants = input.store.listUserParticipants;
  await requireThreadAccess({
    action: input.action,
    ...(input.getAgentConfig ? { getAgentConfig: input.getAgentConfig } : {}),
    ...(listUserParticipants
      ? {
          isParticipant: async () =>
            (
              await listUserParticipants({
                tenantId: input.scope.tenantId,
                threadId: input.threadId,
              })
            ).some((person) => person.user_id === input.scope.userId),
        }
      : {}),
    scope: input.scope,
    session: {
      agent_id: thread.agent_id ?? input.agentId,
      created_by_user_id: thread.created_by_user_id ?? null,
      route_context: thread.route_context ?? {},
      space_id: thread.space_id ?? null,
      visibility: thread.visibility ?? null,
    },
  });
}
