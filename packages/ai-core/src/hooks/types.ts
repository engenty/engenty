import type { AgentConfig } from "../dynamic-contracts.js";

/**
 * An agent authored as a function (PLAN-agent-hooks D1/D7). The body runs
 * synchronously inside a render frame, composes capabilities with hooks
 * (`useModel`, `useTool`, `useThreadState`, …), and returns the agent's base
 * instructions. The render output is a plain {@link AgentConfig} — the same
 * shape `agent.json` produces — validated through `agentConfigSchema`.
 */
export type AgentFn = () => string;

/**
 * Identity every function agent must declare next to its body — the fields a
 * render cannot compose from hooks because they identify the agent before it
 * renders (registry key, display name).
 */
export interface AgentFnDescriptor {
  description?: string;
  fn: AgentFn;
  id: string;
  /** For `kind: "interface"`: how it faces the user. */
  interfaceRole?: "background" | "live" | "remote";
  /** Declared classification; defaults to `specialist` in the config schema. */
  kind?: "chat_surface" | "delegated" | "interface" | "specialist";
  /** Owning module id; absent = platform. */
  moduleId?: string | null;
  name: string;
  /** Provider provenance (never ownership). */
  source?: "builtin" | "database" | "module";
}

/**
 * Per-render context the provider passes in: the thread whose state backs
 * `useThreadState`, and the durable read/write channel. Absent on bare
 * renders (catalog listings, delegate lookups, tests) — state then reads
 * defaults and setters throw.
 */
export interface AgentRenderContext {
  /** Reduced `agent_state` snapshot read before the render. */
  snapshot: ReadonlyMap<string, unknown>;
  /** Durable write channel; absent = setters throw (bare render). */
  store?: HookStateStore;
}

/** The write channel `useThreadState` setters push into (overlay + persist). */
export interface HookStateStore {
  current(key: string): { value: unknown } | undefined;
  write(key: string, value: unknown): Promise<void>;
}

/**
 * Symbol channel for render-composed inline tools (PLAN-agent-hooks D4).
 * Closure tools can't resolve through `registry.getTool(id)` — they hang off
 * the rendered config under this symbol (invisible to zod/JSON, so
 * `AgentConfig` stays serializable) and the assembler folds them into the
 * agent's toolset exactly like `extraTools`.
 */
export const RENDERED_TOOLS = Symbol.for("engenty.ai.renderedTools");

/** Read the symbol channel off a rendered config (absent on data configs). */
export function renderedToolsOf(
  config: AgentConfig
): Record<string, object> | undefined {
  return (config as Record<symbol, unknown>)[RENDERED_TOOLS] as
    | Record<string, object>
    | undefined;
}
