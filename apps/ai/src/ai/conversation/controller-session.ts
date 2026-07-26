// The shared construction recipe for a per-run Mastra `AgentController` +
// `Session` bound to an Engenty thread. Both conversation executors (the root
// chat run and the delegated child run) drive their runs through a Session
// created here, so the hard-won configuration lives in exactly one place:
//
// - The agent goes at the TOP LEVEL (`config.agent`). The controller only
//   combines its `instructions` (our runtime-context) with the agent's own when
//   `config.agent` is set — configured on the mode instead, the runtime-context
//   is silently dropped (the "missing context" bug).
// - `yolo: true` turns the controller's NATIVE tool-approval gate fully OFF.
//   It keys on the Mastra tool NAME, but Engenty rides ONE generic tool
//   (`engenty_tool_execute`), so a per-name gate is structurally too coarse —
//   it can't tell a read from a destructive write, and it parks every tool on
//   `tool_approval_required` → the run hangs. Engenty's REAL approval gate
//   lives at the execution boundary inside `engenty_tool_execute`
//   (lib/tool-approval.ts); frontend-tool + sandbox HITL use the suspend path,
//   not this gate.
// - The session is explicitly bound to the Engenty thread via
//   `thread.switch` — `createSession`'s own "most recent thread" binding is
//   only a starting point and never the thread this run must write to.
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Agent } from "@mastra/core/agent";
import { AgentController, type Session } from "@mastra/core/agent-controller";
import type { MastraMemory } from "@mastra/core/memory";
import { LocalFilesystem, Workspace } from "@mastra/core/workspace";

/** Session-owned controller state Engenty uses (see yolo note above). */
export interface ConversationControllerState {
  yolo?: boolean;
}

export type ConversationController =
  AgentController<ConversationControllerState>;
export type ConversationSession = Session<ConversationControllerState>;

export interface CreateConversationSessionInput {
  agent: Agent;
  /** Stable controller/session id, e.g. `engenty-hs-<threadId>`. */
  id: string;
  /** Controller-level instructions layered above the agent's own (runtime-context). */
  instructions?: string;
  memory: MastraMemory;
  /** The Engenty thread this run reads and writes under. */
  threadId: string;
  /** The run's authenticated user — the memory `resourceId` and session owner. */
  userId: string;
  /**
   * The run's workspace, when the agent has one. A Session requires a workspace
   * instance, so runs without one get {@link placeholderSessionWorkspace}. The
   * session-level workspace feeds no tools to the agent — workspace tools ride
   * the AGENT's own workspace — so an empty one costs nothing.
   */
  workspace?: Workspace;
}

/**
 * A placeholder workspace for runs whose agent has none of its own, isolated
 * per user.
 *
 * A Session requires a workspace, and `Workspace` rejects a config with no
 * filesystem, sandbox or skills at construction time — so something has to be
 * handed over. What it must NOT be is one shared instance: the previous
 * fallback memoised a single workspace over one `tmpdir()` path and gave it to
 * every such run in the process, which put every tenant on the same directory.
 * Nothing mounts this workspace today, so nothing leaked — but it was a
 * cross-tenant file surface waiting for the first tool that did.
 *
 * Rooting it per user removes that without inventing a fake skill, whose
 * visibility to the model would be a behaviour change rather than a fix.
 * Bounded by user count, not by run count.
 */
export function placeholderSessionWorkspace(userId: string): Workspace {
  // The id comes from a verified token, but this builds a path — keep it to
  // characters that cannot escape the base directory.
  const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, "_") || "unknown";
  const basePath = path.join(
    tmpdir(),
    "engenty-session-placeholder-workspace",
    safeUserId
  );
  mkdirSync(basePath, { recursive: true });
  return new Workspace({
    filesystem: new LocalFilesystem({ basePath }),
    name: "engenty-session-placeholder",
  });
}

/**
 * Construct a per-run AgentController, bring it online, and return its Session
 * bound to the given Engenty thread with the native approval gate disabled.
 * The caller owns the controller's lifecycle (`controller.destroy()`).
 */
export async function createConversationSession(
  input: CreateConversationSessionInput
): Promise<{
  controller: ConversationController;
  session: ConversationSession;
}> {
  const controller: ConversationController = new AgentController({
    agent: input.agent,
    defaultModeId: "default",
    id: input.id,
    ...(input.instructions ? { instructions: input.instructions } : {}),
    memory: input.memory,
    modes: [{ id: "default", name: "Default" }],
    resourceId: input.userId,
  });
  await controller.init();
  const session = await controller.createSession({
    id: input.id,
    ownerId: input.userId,
    resourceId: input.userId,
    workspace: input.workspace ?? placeholderSessionWorkspace(input.userId),
  });
  await session.thread.switch({ threadId: input.threadId });
  await session.state.set({ yolo: true });
  return { controller, session };
}
