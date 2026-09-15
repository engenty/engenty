// Per-run instructions, injected as a system message before the user turn:
// canonical Space rules, tenant/user identity + workspace (name, email, role),
// AG-UI app context (route, selection, shell state), and UI language preference.
//
// Shared across the chat runtimes (the legacy harness, the control plane, and the
// Harness Session) so every run sees the SAME context — without it, a run greets
// the user but can't answer "what's my email?".
import type { RunAgentInput } from "@engenty/ag-ui-bridge";
import { SPACE_CONTRACT_PROMPT } from "@engenty/ai-core";
import type { FrontendToolGrant } from "../../../ai/frontend-tools/catalog.js";
import type { ThreadKind } from "../../dal/threads/types.js";
import {
  type AgentStateSessionStore,
  createThreadStoreFromEnv,
} from "../index.js";
import { SHARED_DESK_STYLE_INSTRUCTIONS } from "../instructions/reply-style.js";
import { createSessionAgentStateChannel } from "../registry/function-provider.js";
import type { DroppedWorkspaceMount } from "../workspace/workspace-presets.js";
import { buildAgentUiContextInstructions } from "./agent-ui-context-instructions.js";
import type { RunSpaceResolution } from "./run-space.js";
import { buildRuntimeContextInstructions } from "./runtime-context.js";
import { spaceIdFromRouteContext } from "./session-identity.js";
import type { AgentUiProducerContext, AiSessionScope } from "./types.js";
import { formatWorkspaceMountNote } from "./workspace-mount-note.js";

const LANGUAGE_NAMES: Record<string, string> = {
  de: "German (Deutsch)",
  en: "English",
  es: "Spanish (Español)",
  fr: "French (Français)",
  it: "Italian (Italiano)",
};

/** The user's UI language off the run's route context (`ui_language`). */
export function resolveUiLanguage(
  routeContext: Record<string, unknown> | null | undefined
): string | null {
  if (!(routeContext && typeof routeContext === "object")) {
    return null;
  }
  const scopeObj =
    "scope" in routeContext &&
    routeContext.scope &&
    typeof routeContext.scope === "object"
      ? (routeContext.scope as Record<string, unknown>)
      : null;
  const uiLanguage =
    scopeObj && typeof scopeObj.ui_language === "string"
      ? scopeObj.ui_language
      : null;
  const directUiLanguage =
    typeof routeContext.ui_language === "string"
      ? routeContext.ui_language
      : null;
  return uiLanguage || directUiLanguage;
}

/**
 * The thread's durable agent state, read back to the agent that wrote it.
 *
 * A data-authored agent has no render to hold `useThreadState`, so the same
 * `metadata.agent_state` it writes with `thread_state_set` comes back here —
 * in the volatile runtime block, never the cache prefix, because it changes
 * every time it is written. Empty state renders nothing.
 */
export async function buildThreadStateInstructions(input: {
  /** Overrides the env store; the run lane always takes the default. */
  getStore?: () => AgentStateSessionStore | null;
  scope: AiSessionScope;
  threadId: string;
}): Promise<string> {
  try {
    const getStore = input.getStore ?? createThreadStoreFromEnv;
    const channel = createSessionAgentStateChannel(getStore);
    const state = await channel.load({
      tenantId: input.scope.tenantId,
      threadId: input.threadId,
      userId: input.scope.userId,
    });
    const entries = Object.entries(state);
    if (entries.length === 0) {
      return "";
    }
    return [
      "## Conversation state",
      "What you stored on this thread with `thread_state_set`. It is the record of where this conversation stands — continue from it, and update it when it changes.",
      ...entries.map(([key, value]) => `- ${key}: ${JSON.stringify(value)}`),
    ].join("\n");
  } catch {
    // A run whose thread row is unreadable still has a conversation to hold.
    return "";
  }
}

export interface SessionRuntimeInstructionsInput {
  agentId: string;
  agentUi?: AgentUiProducerContext | null;
  /**
   * Declared workspace mounts this run does not have. Named in the runtime
   * block so a dropped `/data` reads as "not mounted, here is why" and not as
   * "this Space has no files".
   */
  droppedMounts?: readonly DroppedWorkspaceMount[];
  /**
   * Whether this worker-lane agent holds the page-driving tools on this run.
   * Same value the executor registered with, so the prompt names exactly the
   * tools the model has (see `resolveFrontendToolsForAgent`).
   */
  frontendToolGrant?: FrontendToolGrant | null;
  routeContext?: Record<string, unknown> | null;
  runContext?: RunAgentInput["context"];
  scope: AiSessionScope;
  /** Engentys the run's space mounts (Phase C3b). Legacy identity fallback. */
  spaceAgentIds?: readonly string[];
  /** Overrides the route context's space — a task-bound run knows its own. */
  spaceId?: string | null;
  /**
   * Authoritative Space resolution for this run. When present, the prompt
   * consumes the already-fetched surface and must not fall back to a
   * route-context UUID as if it were a mounted Space.
   */
  spaceResolution?: RunSpaceResolution;
  threadId: string;
  /**
   * What kind of thread the turn is in. A shared desk or a room gets the
   * team-chat line; a DM, a run and a pair room do not.
   */
  threadKind?: ThreadKind | null;
}

/**
 * Build the combined runtime-context system instructions for a run: canonical
 * Space rules, workspace identity, AG-UI app context, and language preference.
 */
export async function buildSessionRuntimeInstructions(
  input: SessionRuntimeInstructionsInput
): Promise<string> {
  const [runtimeContext, agentUiContext, threadState] = await Promise.all([
    buildRuntimeContextInstructions({
      scope: input.scope,
      threadId: input.threadId,
      ...(input.spaceResolution
        ? { spaceResolution: input.spaceResolution }
        : {
            // Legacy identity-only fallback for callers that have not yet
            // passed the discriminated resolution. A uuid here is not a
            // resolved surface.
            spaceId:
              input.spaceId ??
              spaceIdFromRouteContext(input.routeContext ?? undefined),
            ...(input.spaceAgentIds
              ? { spaceAgentIds: input.spaceAgentIds }
              : {}),
          }),
    }),
    buildAgentUiContextInstructions({
      agentId: input.agentId,
      agentUi: input.agentUi,
      frontendToolGrant: input.frontendToolGrant ?? null,
      runContext: input.runContext,
      scope: input.scope,
    }),
    buildThreadStateInstructions({
      scope: input.scope,
      threadId: input.threadId,
    }),
  ]);

  let languageInstruction = "";
  const lang = resolveUiLanguage(input.routeContext);
  if (lang) {
    const langName = LANGUAGE_NAMES[lang.toLowerCase()] || lang;
    languageInstruction = `## Language Instruction\n- The user's preferred UI language is ${langName}.\n- Please respond to the user in ${langName}.`;
  }

  const workspaceNote = formatWorkspaceMountNote({
    dropped: input.droppedMounts ?? [],
    resolution: input.spaceResolution,
  });

  const sharedStyle =
    input.threadKind === "desk" || input.threadKind === "room"
      ? SHARED_DESK_STYLE_INSTRUCTIONS
      : "";

  return [
    SPACE_CONTRACT_PROMPT,
    workspaceNote ? `${runtimeContext}\n${workspaceNote}` : runtimeContext,
    sharedStyle,
    agentUiContext,
    threadState,
    languageInstruction,
  ]
    .filter(Boolean)
    .join("\n\n");
}
