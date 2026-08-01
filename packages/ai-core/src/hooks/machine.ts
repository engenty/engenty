// Advisory phase machine over the core hooks (PLAN-agent-hooks D8) —
// deliberately the Flue support-desk pattern: phases are advisory, not
// structural. Tools may stay mounted for the agent's whole life and refuse
// out-of-phase via `guardedTool`; `advance()` mounts a transition tool whose
// closure captures the state setter. Built entirely from public hooks —
// proof that authors can layer conventions without framework support.
//
// Tools are authored in the Vercel AI SDK shape (`tool()` from `ai`), which
// Mastra's `ToolsInput` accepts natively — keeps @engenty/ai-core free of
// @mastra imports.
import { tool } from "ai";
import { z } from "zod";
import { useInstruction, useThreadState, useTool } from "./hooks.js";

export interface MachineHandle<P extends string> {
  /**
   * Mount the transition tool into the target phase. Call from the phase
   * that owns the transition (conditional mounting is safe between turns —
   * the toolset is fixed within a run).
   */
  advance(target: P, description: string): void;
  /** `null` when tools of `target` may run; otherwise the refusal text. */
  check(target: P): () => string | null;
  phase: P;
}

/**
 * A phased workflow driven by one `useThreadState` key. Persists the current
 * phase per thread; announces the workflow and current phase via
 * `useInstruction`; hands back `advance` (transition tools) and `check`
 * (guards for `guardedTool`).
 */
export function useMachine<P extends string>(options: {
  name: string;
  phases: readonly P[];
  initial: P;
}): MachineHandle<P> {
  const [phase, setPhase] = useThreadState<P>(options.name, options.initial);
  if (!options.phases.includes(phase)) {
    throw new Error(
      `[agent-hooks] useMachine("${options.name}") read persisted phase ` +
        `"${phase}" which is not in [${options.phases.join(", ")}]. A phase ` +
        "rename must migrate persisted thread state."
    );
  }
  useInstruction(
    `You operate a phased workflow: ${options.phases.join(" → ")}. ` +
      `Your current phase is "${phase}". Phase changes are announced by ` +
      "transition tool results and take full effect on the next turn. Trust " +
      "your judgment about when a phase's work is done."
  );
  const check = (target: P) => (): string | null =>
    phase === target
      ? null
      : `Refused: that tool belongs to the "${target}" phase; you are in "${phase}".`;
  return {
    phase,
    check,
    advance(target, description) {
      useTool(
        `enter_${target}`,
        tool({
          description,
          inputSchema: z.object({}),
          execute: async () => {
            await setPhase(target);
            return `You are now in the "${target}" phase. Its tools and instructions apply from the next turn.`;
          },
        })
      );
    },
  };
}

/**
 * Wrap an AI SDK tool so it refuses — via the guard's message — instead of
 * running when `check()` fails. Pairs with `useMachine(...).check(phase)`:
 * the tool stays mounted for the agent's whole life; guarding, not mounting,
 * makes it phase-scoped.
 */
export function guardedTool<T extends { execute?: unknown }>(
  check: () => string | null,
  toolDefinition: T
): T {
  const execute = toolDefinition.execute;
  if (typeof execute !== "function") {
    return toolDefinition;
  }
  return {
    ...toolDefinition,
    execute: (...args: unknown[]) => {
      const refusal = check();
      if (refusal !== null) {
        return refusal;
      }
      return (execute as (...a: unknown[]) => unknown)(...args);
    },
  };
}
