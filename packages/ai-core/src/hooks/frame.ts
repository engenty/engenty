// The render frame: the module-global slot Engenty agent hooks resolve
// against while an agent function runs (PLAN-agent-hooks D2). Agent functions
// are synchronous, so a single slot never interleaves — same discipline as
// Preact's `currentComponent` (and Flue's frame.ts). Hooks throw when the
// slot is empty (called from tools, callbacks, or module scope).
import { DEFAULT_AI_CHAT_MODEL_ID } from "../config/chat-model-id.js";
import { type AgentConfig, agentConfigSchema } from "../dynamic-contracts.js";
import {
  type AgentFnDescriptor,
  type AgentRenderContext,
  RENDERED_TOOLS,
} from "./types.js";

/**
 * The mutable draft hooks write into. There is no hook IR (D1): the draft is
 * `Partial<AgentConfig>` with the array fields pre-initialized so hooks can
 * push before the final `agentConfigSchema.parse`.
 */
export interface RenderFrame {
  draft: Partial<AgentConfig> & {
    skillIds: string[];
    toolIds: string[];
  };
  /** `useInstruction` contributions, joined after the returned base. */
  instructions: string[];
  /** Guard: `useModel`/`usePurpose` at most once per render. */
  modelDeclared: boolean;
  state: AgentRenderContext | undefined;
  /** `useThreadState` keys declared this render; duplicates throw. */
  stateKeys: Set<string>;
  /** Inline `useTool` mounts by name — ride the {@link RENDERED_TOOLS} channel. */
  tools: Record<string, object>;
}

let currentFrame: RenderFrame | undefined;

/** Whether an agent render is on the stack (state setters must throw then). */
export function isRendering(): boolean {
  return currentFrame !== undefined;
}

/** Resolve the active render frame, or throw the outside-render error. */
export function requireRenderFrame(hookName: string): RenderFrame {
  if (!currentFrame) {
    throw new Error(
      `[agent-hooks] ${hookName}() was called outside an agent function. ` +
        "Hooks compose an agent while it renders: call them synchronously in " +
        "the agent function body (or a custom hook it calls), not from tool " +
        "execute callbacks, event handlers, or module scope."
    );
  }
  return currentFrame;
}

/**
 * Run one synchronous render of a function agent and parse the draft into a
 * validated {@link AgentConfig}. Inline tools attach under the
 * {@link RENDERED_TOOLS} symbol so the config stays JSON/zod-clean.
 */
export function renderAgentFn(
  descriptor: AgentFnDescriptor,
  state?: AgentRenderContext
): AgentConfig {
  if (currentFrame) {
    throw new Error(
      "[agent-hooks] Re-entrant agent render. An agent function must not " +
        "invoke another agent function directly; compose shared behavior " +
        "with custom hooks instead."
    );
  }
  const frame: RenderFrame = {
    draft: { skillIds: [], toolIds: [] },
    instructions: [],
    tools: {},
    stateKeys: new Set(),
    modelDeclared: false,
    state,
  };
  currentFrame = frame;
  let instructions: string;
  try {
    const result = descriptor.fn();
    if (isPromiseLike(result)) {
      throw new Error(
        `[agent-hooks] Agent "${descriptor.id}" must render synchronously. ` +
          "Move async work into tool execute callbacks or provider-side " +
          "resolution — the render is a pure composition pass."
      );
    }
    if (typeof result !== "string" || result.trim().length === 0) {
      throw new Error(
        `[agent-hooks] Agent "${descriptor.id}" must return its base ` +
          "instructions as a non-empty string. Everything else — model, " +
          "tools, skills — is composed with hooks in the body."
      );
    }
    instructions = [result, ...frame.instructions].join("\n\n");
  } finally {
    currentFrame = undefined;
  }

  const parsed = agentConfigSchema.parse({
    ...frame.draft,
    description: frame.draft.description ?? descriptor.description,
    id: descriptor.id,
    instructions,
    // Function agents have no static model column; resolution happens via
    // purpose/tenant tiers (or an explicit useModel pin) downstream. The
    // schema requires `model`, so fall back to the platform default — the
    // same fallback `defineModuleAi` seeds for scanned agents — which only
    // matters on paths assembled without a tenant modelConfig.
    model:
      frame.draft.modelOverride ??
      frame.draft.model ??
      DEFAULT_AI_CHAT_MODEL_ID,
    name: descriptor.name,
    // Ownership (`source`, `moduleId`, `kind`) is the owner's declaration on
    // the descriptor — a module function agent is a module agent, never an
    // assumed builtin.
    ...(descriptor.kind ? { kind: descriptor.kind } : {}),
    ...(descriptor.interfaceRole
      ? { interfaceRole: descriptor.interfaceRole }
      : {}),
    ...(descriptor.moduleId === undefined
      ? {}
      : { moduleId: descriptor.moduleId }),
    ...((frame.draft.source ?? descriptor.source)
      ? { source: frame.draft.source ?? descriptor.source }
      : {}),
  });
  if (Object.keys(frame.tools).length > 0) {
    (parsed as Record<symbol, unknown>)[RENDERED_TOOLS] = frame.tools;
  }
  return parsed;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof (value as { then: unknown }).then === "function"
  );
}
