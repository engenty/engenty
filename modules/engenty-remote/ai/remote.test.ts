import { describe, expect, it } from "vitest";
import { remoteAiRegistration } from "./registrar.js";
import { ENGENTY_REMOTE_AGENT_ID, remoteAgentConfig } from "./remote.js";

describe("engenty.remote agent config", () => {
  it("has the correct agent id", () => {
    expect(remoteAgentConfig.id).toBe(ENGENTY_REMOTE_AGENT_ID);
    expect(remoteAgentConfig.id).toBe("engenty.remote");
  });

  it("declares the dynamic-dispatch catalog tool ids", () => {
    expect(remoteAgentConfig.toolIds).toContain("engenty_tools_search");
    expect(remoteAgentConfig.toolIds).toContain("engenty_tool_execute");
    expect(remoteAgentConfig.toolIds).toContain("registry_agents_list");
  });

  it("has a non-empty system prompt carrying the brevity contract", () => {
    expect(typeof remoteAgentConfig.instructions).toBe("string");
    expect(remoteAgentConfig.instructions.length).toBeGreaterThan(100);
    expect(remoteAgentConfig.instructions).toContain("brevity contract");
  });

  it("uses staff workspace preset", () => {
    expect(remoteAgentConfig.workspace?.preset).toBe("staff");
  });
});

describe("remoteAiRegistration", () => {
  it("registers for the correct module", () => {
    const reg = remoteAiRegistration();
    expect(reg.module_id).toBe("engenty-remote");
  });

  it("includes dynamic agent_configs", () => {
    const reg = remoteAiRegistration();
    expect(reg.dynamic?.agent_configs).toHaveLength(1);
    expect(reg.dynamic?.agent_configs?.[0]?.id).toBe(ENGENTY_REMOTE_AGENT_ID);
  });

  it("includes instruction documents for AGENTS and SOUL", () => {
    const reg = remoteAiRegistration();
    const files = reg.instruction_documents?.map((d) => d.filename) ?? [];
    expect(files).toContain("AGENTS.md");
    expect(files).toContain("SOUL.md");
  });
});
