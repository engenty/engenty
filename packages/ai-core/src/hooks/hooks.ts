// Engenty agent hooks (PLAN-agent-hooks). Every hook is a direct write onto
// the render frame's `Partial<AgentConfig>` draft — AgentConfig's own field
// names, no intermediate representation (D1). Custom hooks are plain
// functions calling these; the ambient frame makes composition free.
import type {
  AgentGuardrailsConfig,
  AgentLimitsConfig,
  AgentModelPurpose,
  AgentWorkspaceConfig,
} from "../dynamic-contracts.js";
import { isRendering, requireRenderFrame } from "./frame.js";

/**
 * Pin the agent to an explicit model id. Writes `modelOverride`, so the pin
 * flows through the same tenant-grant filter as a row-authored pin
 * (`resolveAgentModelId`) — a render can request a model, only governance
 * decides. At most one model declaration (`useModel` or `usePurpose`) per
 * render.
 */
export function useModel(modelId: string): void {
  const frame = requireRenderFrame("useModel");
  assertSingleModelDeclaration(frame.modelDeclared, "useModel");
  frame.modelDeclared = true;
  frame.draft.modelOverride = modelId;
}

/**
 * Inherit the tenant's model tier for a purpose (`chat`, `routing`,
 * `research`, `planning_coding`, `safeguard`). Mutually exclusive with
 * `useModel` in one render.
 */
export function usePurpose(purpose: AgentModelPurpose): void {
  const frame = requireRenderFrame("usePurpose");
  assertSingleModelDeclaration(frame.modelDeclared, "usePurpose");
  frame.modelDeclared = true;
  frame.draft.purpose = purpose;
}

/**
 * Append an instruction block after the agent's returned base instructions,
 * in call order, joined with blank lines. For file content, import the
 * markdown and pass it here (files stay the content medium — D7).
 */
export function useInstruction(markdown: string): void {
  const frame = requireRenderFrame("useInstruction");
  const trimmed = markdown.trim();
  if (trimmed.length > 0) {
    frame.instructions.push(trimmed);
  }
}

/**
 * Name a preferred skill. Same semantics as `skillIds` on a data config:
 * a hint surfaced in the prompt — SKILL.md content loads on demand via the
 * workspace `skill`/`skill_search` tools, never inlined here.
 */
export function useSkillHint(name: string): void {
  const frame = requireRenderFrame("useSkillHint");
  if (!frame.draft.skillIds.includes(name)) {
    frame.draft.skillIds.push(name);
  }
}

/** Attach a registry-resolved tool by id (same as `toolIds` on a data config). */
export function useRegisteredTool(id: string): void {
  const frame = requireRenderFrame("useRegisteredTool");
  if (!frame.draft.toolIds.includes(id)) {
    frame.draft.toolIds.push(id);
  }
}

/**
 * Mount an inline tool (closures allowed — this is how transition tools
 * capture state setters). Rides the RENDERED_TOOLS symbol channel into the
 * assembler's extraTools merge; wins over registry tools on name clash.
 * Duplicate names within one render throw.
 */
export function useTool(name: string, definition: object): void {
  const frame = requireRenderFrame("useTool");
  if (name in frame.tools) {
    throw new Error(
      `[agent-hooks] useTool() mounted the tool name "${name}" twice in one ` +
        "render. Each tool mounts once; share it from a single custom hook."
    );
  }
  frame.tools[name] = definition;
}

/** Declare a sub-agent by registry id (same as `subAgents` on a data config). */
export function useSubagent(id: string, alias?: string): void {
  const frame = requireRenderFrame("useSubagent");
  frame.draft.subAgents ??= [];
  frame.draft.subAgents.push({ id, ...(alias ? { alias } : {}) });
}

/** Request a workspace (filesystem + skills + sandbox), schema-validated at parse. */
export function useWorkspace(config: AgentWorkspaceConfig): void {
  const frame = requireRenderFrame("useWorkspace");
  frame.draft.workspace = config;
}

/** Opt into the Mastra guardrail processors for this agent. */
export function useGuardrails(config: AgentGuardrailsConfig): void {
  const frame = requireRenderFrame("useGuardrails");
  frame.draft.guardrails = config;
}

/** Layer per-agent operational limits (iteration cap, budget). */
export function useLimits(config: AgentLimitsConfig): void {
  const frame = requireRenderFrame("useLimits");
  frame.draft.limits = config;
}

export type ThreadStateSetter<T> = (
  value: T | ((previous: T) => T)
) => Promise<void>;

/**
 * Durable per-thread state (D3): reads the render-time snapshot of
 * `agent_sessions.metadata.agent_state`, returns a setter that persists a new
 * value. String-keyed, so conditional calls are legal; duplicate keys in one
 * render throw.
 *
 * Semantics (Flue-aligned):
 * - The render value is a snapshot. Setters THROW during render — a render is
 *   a pure read; write from tool execute callbacks.
 * - The updater form (`set(prev => …)`) resolves `previous` at CALL time
 *   through the store's overlay (read-your-writes within a run), not the
 *   snapshot the closure was born with.
 * - Values must be JSON-serializable; `undefined` throws (no unset).
 * - Bare renders (catalog listings, delegates, tests) read defaults and their
 *   setters throw.
 */
export function useThreadState<T>(
  key: string,
  defaultValue: T
): [T, ThreadStateSetter<T>] {
  const frame = requireRenderFrame("useThreadState");
  if (typeof key !== "string" || key.length === 0) {
    throw new Error(
      "[agent-hooks] useThreadState(key, defaultValue) takes the state key " +
        "as its first argument — a non-empty string."
    );
  }
  if (frame.stateKeys.has(key)) {
    throw new Error(
      `[agent-hooks] Duplicate useThreadState key "${key}" in one render. ` +
        "Keys identify a value across renders and must be unique."
    );
  }
  frame.stateKeys.add(key);

  const store = frame.state?.store;
  const snapshot = frame.state?.snapshot;
  const persisted =
    store?.current(key) ??
    (snapshot?.has(key) ? { value: snapshot.get(key) } : undefined);
  const value = (persisted ? persisted.value : defaultValue) as T;

  const setValue: ThreadStateSetter<T> = (next) => {
    // Sync throw: a write during render is a programming error in the agent
    // body — it must fail the render, not vanish into an unawaited rejection.
    if (isRendering()) {
      throw new Error(
        `[agent-hooks] Thread state "${key}" was written during render. ` +
          "Renders are pure reads — write from tool execute callbacks, and " +
          "use the default value for the initial value."
      );
    }
    return (async () => {
      if (!store) {
        throw new Error(
          `[agent-hooks] Thread state "${key}" has no durable store behind ` +
            "this render (bare/catalog render), so writes are unavailable."
        );
      }
      let resolved: unknown = next;
      if (typeof next === "function") {
        const current = store.current(key);
        resolved = (next as (previous: T) => T)(
          (current ? current.value : defaultValue) as T
        );
      }
      await store.write(key, normalizeJsonValue(key, resolved));
    })();
  };
  return [value, setValue];
}

function assertSingleModelDeclaration(declared: boolean, hook: string): void {
  if (declared) {
    throw new Error(
      `[agent-hooks] ${hook}() conflicts with an earlier model declaration ` +
        "in this render. Declare the model at most once (useModel OR usePurpose)."
    );
  }
}

function normalizeJsonValue(key: string, value: unknown): unknown {
  if (value === undefined) {
    throw new Error(
      `[agent-hooks] Thread state "${key}" cannot be set to undefined. ` +
        "State values are JSON; there is no unset."
    );
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    throw new Error(
      `[agent-hooks] Thread state "${key}" was set to a non-JSON-serializable value.`
    );
  }
}
