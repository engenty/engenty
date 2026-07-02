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
import type { Agent } from "@mastra/core/agent";
import { AgentController, type Session } from "@mastra/core/agent-controller";
import type { MastraMemory } from "@mastra/core/memory";
import { Workspace } from "@mastra/core/workspace";

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
   * The run's workspace, when the agent has one. A Session REQUIRES a workspace
   * instance; runs without one get an empty `new Workspace({})`, which
   * contributes no tools (workspace tools are gated on filesystem/sandbox
   * presence) — the same behavior as the pre-Session runtime, which carried no
   * workspace at all.
   */
  workspace?: Workspace;
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
    workspace: input.workspace ?? new Workspace({}),
  });
  await session.thread.switch({ threadId: input.threadId });
  await session.state.set({ yolo: true });
  return { controller, session };
}
