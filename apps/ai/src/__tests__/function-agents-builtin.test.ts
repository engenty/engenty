import { renderAgentFn, renderedToolsOf } from "@engenty/ai-core";
import { describe, expect, it } from "vitest";
import {
  ENGENTY_FILE_ANALYST_AGENT_ID,
  ENGENTY_FILE_ANALYST_INSTRUCTIONS,
  ENGENTY_FILE_ANALYST_TOOL_IDS,
  engentyFileAnalystAgent,
} from "../../ai/agents/engenty.file-analyst/index.js";
import {
  ISSUE_TRIAGE_DEMO_AGENT_ID,
  issueTriageDemoAgent,
} from "../ai/agents/function-agents/issue-triage-demo.js";
import { createDefaultAiRegistry } from "../ai/agents.js";
import type { FunctionAgentStateChannel } from "../ai/registry/function-provider.js";

function memoryChannel(): FunctionAgentStateChannel & {
  state: Record<string, unknown>;
} {
  const holder: { state: Record<string, unknown> } = { state: {} };
  return {
    get state() {
      return holder.state;
    },
    load: async () => holder.state,
    persist: async (_ctx, state) => {
      holder.state = state;
    },
  };
}

const CONTEXT = { tenantId: "t1", threadId: "th1", userId: "u1" };

describe("engenty.file-analyst as a function agent", () => {
  it("renders the same effective config the static object carried", () => {
    const config = renderAgentFn(engentyFileAnalystAgent);
    expect(config.id).toBe(ENGENTY_FILE_ANALYST_AGENT_ID);
    expect(config.name).toBe("File Analyst");
    expect(config.instructions).toBe(ENGENTY_FILE_ANALYST_INSTRUCTIONS);
    expect(config.toolIds).toEqual(ENGENTY_FILE_ANALYST_TOOL_IDS);
    expect(config.skillIds).toEqual([]);
    expect(config.source).toBe("builtin");
    // No purpose declared → runtime inheritance stays structural (chat tier),
    // exactly like the old static config (which had no purpose field).
    expect(config.purpose).toBeUndefined();
  });

  it("resolves through the default registry (provider wiring)", async () => {
    const registry = createDefaultAiRegistry();
    const config = await registry.getAgentConfig(ENGENTY_FILE_ANALYST_AGENT_ID);
    expect(config?.name).toBe("File Analyst");
    expect(config?.toolIds).toEqual(ENGENTY_FILE_ANALYST_TOOL_IDS);
  });
});

describe("issue-triage demo agent (phase-machine proof)", () => {
  it("walks reproduce → diagnose → report across renders", async () => {
    const channel = memoryChannel();
    const registry = createDefaultAiRegistry({
      functionAgents: [issueTriageDemoAgent],
      stateChannel: channel,
    });

    // Turn 1: reproduce — chat-tier, repro skill, one transition tool.
    const first = await registry.getAgentConfig(
      ISSUE_TRIAGE_DEMO_AGENT_ID,
      CONTEXT
    );
    expect(first?.purpose).toBeUndefined();
    expect(first?.skillIds).toEqual(["repro-checklist"]);
    expect(first?.instructions).toContain('current phase is "reproduce"');
    const tools1 = renderedToolsOf(first ?? ({} as never)) as Record<
      string,
      { execute: (input: unknown) => Promise<unknown> }
    >;
    expect(Object.keys(tools1)).toEqual(["enter_diagnose"]);

    // The model calls the transition tool during turn 1.
    await tools1.enter_diagnose?.execute({});
    expect(channel.state).toEqual({ step: "diagnose" });

    // Turn 2: diagnose — planning/coding tier, debugging skill, next tool.
    const second = await registry.getAgentConfig(
      ISSUE_TRIAGE_DEMO_AGENT_ID,
      CONTEXT
    );
    expect(second?.purpose).toBe("planning_coding");
    expect(second?.skillIds).toEqual(["debugging-guide"]);
    const tools2 = renderedToolsOf(second ?? ({} as never)) as Record<
      string,
      { execute: (input: unknown) => Promise<unknown> }
    >;
    expect(Object.keys(tools2)).toEqual(["enter_report"]);
    await tools2.enter_report?.execute({});

    // Turn 3: report — terminal phase, no transition tools left.
    const third = await registry.getAgentConfig(
      ISSUE_TRIAGE_DEMO_AGENT_ID,
      CONTEXT
    );
    expect(third?.instructions).toContain('current phase is "report"');
    expect(renderedToolsOf(third ?? ({} as never))).toBeUndefined();
  });
});
