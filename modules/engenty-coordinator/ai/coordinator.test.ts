import { describe, expect, it } from "vitest";
import {
  coordinatorAgentConfig,
  ENGENTY_COORDINATOR_AGENT_ID,
} from "./coordinator.js";
import { coordinatorAiRegistration } from "./registrar.js";

describe("engenty.coordinator agent config", () => {
  it("has the correct agent id", () => {
    expect(coordinatorAgentConfig.id).toBe(ENGENTY_COORDINATOR_AGENT_ID);
    expect(coordinatorAgentConfig.id).toBe("engenty.coordinator");
  });

  it("declares required tool ids including registry lookup", () => {
    expect(coordinatorAgentConfig.toolIds).toContain("engenty_tools_search");
    expect(coordinatorAgentConfig.toolIds).toContain("engenty_tool_execute");
    expect(coordinatorAgentConfig.toolIds).toContain("registry_agents_list");
  });

  it("has a non-empty system prompt", () => {
    expect(typeof coordinatorAgentConfig.instructions).toBe("string");
    expect(coordinatorAgentConfig.instructions.length).toBeGreaterThan(100);
  });

  it("uses staff workspace preset", () => {
    expect(coordinatorAgentConfig.workspace?.preset).toBe("staff");
  });
});

describe("coordinatorAiRegistration", () => {
  it("registers for the correct module", () => {
    const reg = coordinatorAiRegistration();
    expect(reg.module_id).toBe("engenty-coordinator");
  });

  it("includes dynamic agent_configs", () => {
    const reg = coordinatorAiRegistration();
    expect(reg.dynamic?.agent_configs).toHaveLength(1);
    expect(reg.dynamic?.agent_configs?.[0]?.id).toBe(
      ENGENTY_COORDINATOR_AGENT_ID
    );
  });

  it("no longer declares the heartbeat as a routine (now a system job)", () => {
    // Per the Actions/Tasks/Routines spec, routine = schedule → Task. The
    // coordinator heartbeat moved to a system job in apps/ai (system-jobs.ts).
    const reg = coordinatorAiRegistration();
    expect(reg.routines ?? []).toHaveLength(0);
  });

  it("includes instruction documents for AGENTS, SOUL, HEARTBEAT", () => {
    const reg = coordinatorAiRegistration();
    const keys = reg.instruction_documents?.map((d) => d.filename) ?? [];
    expect(keys).toContain("AGENTS.md");
    expect(keys).toContain("SOUL.md");
    expect(keys).toContain("HEARTBEAT.md");
  });
});
