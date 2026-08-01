import { describe, expect, it, vi } from "vitest";
import { renderAgentFn } from "../hooks/frame.js";
import {
  useInstruction,
  useModel,
  usePurpose,
  useRegisteredTool,
  useSkillHint,
  useSubagent,
  useThreadState,
  useTool,
} from "../hooks/hooks.js";
import { guardedTool, useMachine } from "../hooks/machine.js";
import { createHookStateStore } from "../hooks/state-buffer.js";
import {
  type AgentFnDescriptor,
  type AgentRenderContext,
  renderedToolsOf,
} from "../hooks/types.js";

const descriptor = (fn: () => string): AgentFnDescriptor => ({
  fn,
  id: "test.agent",
  name: "Test Agent",
});

const contextWith = (
  entries: Record<string, unknown>,
  persist = vi.fn(async () => {})
): AgentRenderContext & { persist: typeof persist } => {
  const snapshot = new Map(Object.entries(entries));
  return {
    persist,
    snapshot,
    store: createHookStateStore({ persist, snapshot }),
  };
};

describe("renderAgentFn", () => {
  it("renders a draft that parses as AgentConfig — no mapping layer", () => {
    const config = renderAgentFn(
      descriptor(() => {
        usePurpose("planning_coding");
        useSkillHint("triage");
        useRegisteredTool("engenty_tool_execute");
        useSubagent("engenty.cli", "cli");
        useInstruction("Extra block.");
        return "Base instructions.";
      })
    );
    expect(config.id).toBe("test.agent");
    expect(config.purpose).toBe("planning_coding");
    expect(config.skillIds).toEqual(["triage"]);
    expect(config.toolIds).toEqual(["engenty_tool_execute"]);
    expect(config.subAgents).toEqual([{ alias: "cli", id: "engenty.cli" }]);
    expect(config.instructions).toBe("Base instructions.\n\nExtra block.");
    // Serializable: the symbol channel must not leak into JSON.
    expect(JSON.parse(JSON.stringify(config))).not.toHaveProperty("tools");
  });

  it("carries inline tools on the symbol channel, not in the config", () => {
    const config = renderAgentFn(
      descriptor(() => {
        useTool("my_tool", { description: "x", execute: async () => "ok" });
        return "Base.";
      })
    );
    expect(Object.keys(renderedToolsOf(config) ?? {})).toEqual(["my_tool"]);
    expect(JSON.stringify(config)).not.toContain("my_tool");
  });

  it("throws on hooks outside a render", () => {
    expect(() => useModel("anthropic/claude-sonnet-5")).toThrow(
      /outside an agent function/
    );
  });

  it("throws on async agent functions", () => {
    expect(() =>
      renderAgentFn(descriptor((async () => "hi") as unknown as () => string))
    ).toThrow(/must render synchronously/);
  });

  it("throws on re-entrant renders", () => {
    expect(() =>
      renderAgentFn(
        descriptor(() => {
          renderAgentFn(descriptor(() => "inner"));
          return "outer";
        })
      )
    ).toThrow(/Re-entrant/);
  });

  it("throws on empty instructions", () => {
    expect(() => renderAgentFn(descriptor(() => ""))).toThrow(
      /non-empty string/
    );
  });

  it("rejects a second model declaration in one render", () => {
    expect(() =>
      renderAgentFn(
        descriptor(() => {
          useModel("a/b");
          usePurpose("chat");
          return "Base.";
        })
      )
    ).toThrow(/at most once/);
  });

  it("clears the frame after a throwing render", () => {
    expect(() =>
      renderAgentFn(
        descriptor(() => {
          throw new Error("boom");
        })
      )
    ).toThrow("boom");
    const config = renderAgentFn(descriptor(() => "Recovered."));
    expect(config.instructions).toBe("Recovered.");
  });
});

describe("useThreadState", () => {
  it("reads defaults on a bare render and setters throw", async () => {
    let setter: ((v: string) => Promise<void>) | undefined;
    const config = renderAgentFn(
      descriptor(() => {
        const [phase, setPhase] = useThreadState("phase", "start");
        setter = setPhase;
        return `Phase: ${phase}`;
      })
    );
    expect(config.instructions).toBe("Phase: start");
    await expect(setter?.("next")).rejects.toThrow(/no durable store/);
  });

  it("reads the snapshot and persists writes from tool callbacks", async () => {
    const ctx = contextWith({ phase: "diagnose" });
    let setter: ((v: string) => Promise<void>) | undefined;
    const config = renderAgentFn(
      descriptor(() => {
        const [phase, setPhase] = useThreadState("phase", "start");
        setter = setPhase;
        return `Phase: ${phase}`;
      }),
      ctx
    );
    expect(config.instructions).toBe("Phase: diagnose");
    await setter?.("report");
    expect(ctx.persist).toHaveBeenCalledWith({ phase: "report" });
  });

  it("throws when a setter runs during render", () => {
    const ctx = contextWith({});
    expect(() =>
      renderAgentFn(
        descriptor(() => {
          const [, setPhase] = useThreadState("phase", "start");
          void setPhase("next");
          return "Base.";
        }),
        ctx
      )
    ).toThrow(/during render/);
  });

  it("throws on duplicate keys, allows conditional keys", () => {
    expect(() =>
      renderAgentFn(
        descriptor(() => {
          useThreadState("k", 1);
          useThreadState("k", 2);
          return "Base.";
        })
      )
    ).toThrow(/Duplicate/);
    // Conditional (keyed) state is legal: presence may vary across renders.
    const config = renderAgentFn(
      descriptor(() => {
        const [on] = useThreadState("on", true);
        if (on) {
          useThreadState("only-sometimes", 0);
        }
        return "Base.";
      })
    );
    expect(config.instructions).toBe("Base.");
  });

  it("resolves updaters through the overlay (read-your-writes)", async () => {
    const ctx = contextWith({ count: 1 });
    let setter: ((v: (p: number) => number) => Promise<void>) | undefined;
    renderAgentFn(
      descriptor(() => {
        const [, setCount] = useThreadState("count", 0);
        setter = setCount;
        return "Base.";
      }),
      ctx
    );
    await setter?.((p) => p + 1);
    await setter?.((p) => p + 1);
    expect(ctx.persist).toHaveBeenLastCalledWith({ count: 3 });
  });

  it("drops deep-equal no-op writes", async () => {
    const ctx = contextWith({ phase: "a" });
    let setter: ((v: string) => Promise<void>) | undefined;
    renderAgentFn(
      descriptor(() => {
        const [, setPhase] = useThreadState("phase", "a");
        setter = setPhase;
        return "Base.";
      }),
      ctx
    );
    await setter?.("a");
    expect(ctx.persist).not.toHaveBeenCalled();
  });

  it("rejects undefined and non-JSON values", async () => {
    const ctx = contextWith({});
    let setter: ((v: unknown) => Promise<void>) | undefined;
    renderAgentFn(
      descriptor(() => {
        const [, set] = useThreadState<unknown>("k", null);
        setter = set;
        return "Base.";
      }),
      ctx
    );
    await expect(setter?.(undefined)).rejects.toThrow(/undefined/);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    await expect(setter?.(cyclic)).rejects.toThrow(/non-JSON/);
  });
});

describe("custom hook composition", () => {
  it("composes with zero infrastructure — a custom hook is a function", () => {
    function useCompanyAgent(skills: string[]) {
      useInstruction("Company voice.");
      for (const s of skills) {
        useSkillHint(s);
      }
    }
    const config = renderAgentFn(
      descriptor(() => {
        useCompanyAgent(["pricing", "tone"]);
        return "Base.";
      })
    );
    expect(config.skillIds).toEqual(["pricing", "tone"]);
    expect(config.instructions).toContain("Company voice.");
  });
});

describe("useMachine", () => {
  const machineAgent = () => {
    const m = useMachine({
      initial: "reproduce",
      name: "step",
      phases: ["reproduce", "diagnose", "report"] as const,
    });
    if (m.phase === "reproduce") {
      m.advance("diagnose", "Call once the issue reproduces.");
    }
    if (m.phase === "diagnose") {
      usePurpose("planning_coding");
      m.advance("report", "Call once root cause is identified.");
    }
    return "Triage the issue.";
  };

  it("mounts the phase's transition tool and announces the phase", () => {
    const config = renderAgentFn(descriptor(machineAgent));
    expect(config.instructions).toContain('current phase is "reproduce"');
    expect(Object.keys(renderedToolsOf(config) ?? {})).toEqual([
      "enter_diagnose",
    ]);
    expect(config.purpose).toBeUndefined();
  });

  it("changes toolset and model tier on the next render after a transition", async () => {
    const persisted: Record<string, unknown> = {};
    const persist = vi.fn(async (state: Record<string, unknown>) => {
      Object.assign(persisted, state);
    });
    const ctx1 = contextWith({}, persist);
    const config1 = renderAgentFn(descriptor(machineAgent), ctx1);
    const enterDiagnose = renderedToolsOf(config1)?.enter_diagnose as {
      execute: (input: unknown, ctx?: unknown) => Promise<string>;
    };
    // Turn N: the model calls the transition tool.
    const result = await enterDiagnose.execute({});
    expect(result).toContain('"diagnose" phase');
    // Turn N+1: a fresh render over the persisted snapshot.
    const ctx2 = contextWith(persisted);
    const config2 = renderAgentFn(descriptor(machineAgent), ctx2);
    expect(config2.purpose).toBe("planning_coding");
    expect(Object.keys(renderedToolsOf(config2) ?? {})).toEqual([
      "enter_report",
    ]);
    expect(config2.instructions).toContain('current phase is "diagnose"');
  });

  it("throws loudly on a persisted phase outside the declared set", () => {
    const ctx = contextWith({ step: "renamed-away" });
    expect(() => renderAgentFn(descriptor(machineAgent), ctx)).toThrow(
      /not in \[reproduce/
    );
  });
});

describe("guardedTool", () => {
  it("refuses out-of-phase and passes through in-phase", async () => {
    const tool = {
      description: "send",
      execute: vi.fn(async () => "sent"),
    };
    let phase = "drafting";
    const check = () =>
      phase === "committing" ? null : `Refused: you are in "${phase}".`;
    const guarded = guardedTool(check, tool);
    expect(await guarded.execute()).toContain("Refused");
    expect(tool.execute).not.toHaveBeenCalled();
    phase = "committing";
    expect(await guarded.execute()).toBe("sent");
  });
});
