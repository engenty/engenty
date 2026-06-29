import { describe, expect, it } from "vitest";
import {
  ACTIVITY_ROOT_PATH,
  AGENTS_CATALOG_ROOT_PATH,
  AGENTS_WORKSPACE_ROOT_PATH,
  buildAgentDetailPath,
  buildAgentInstructionsPath,
  buildAgentSessionDetailPath,
  buildAgentSessionsPath,
  buildAgentsCatalogPath,
  buildSkillDetailPath,
  parseAgentSessionDetailFromPathname,
  parseAgentsWorkspaceSection,
} from "./agent-workspace-url-state";

describe("parseAgentsWorkspaceSection", () => {
  it("parses the landing and agent sections from canonical paths", () => {
    expect(parseAgentsWorkspaceSection(AGENTS_WORKSPACE_ROOT_PATH)).toBe(
      "landing"
    );
    // Agent detail now lives under /agents/:agentId
    expect(
      parseAgentsWorkspaceSection(`${AGENTS_CATALOG_ROOT_PATH}/agent-1`)
    ).toBe("agents-catalog");
    expect(
      parseAgentsWorkspaceSection(
        `${AGENTS_CATALOG_ROOT_PATH}/agent-1/instructions`
      )
    ).toBe("instructions");
  });

  it("parses per-agent sessions paths without colliding with the catalog", () => {
    expect(
      parseAgentsWorkspaceSection(
        `${AGENTS_CATALOG_ROOT_PATH}/agent-1/sessions`
      )
    ).toBe("sessions");
    expect(
      parseAgentsWorkspaceSection(
        `${AGENTS_CATALOG_ROOT_PATH}/agent-1/sessions/session-99`
      )
    ).toBe("sessions");
    // Activity path (renamed from sessions catalog) should not return "sessions"
    // section — it returns "sessions" only for legacy compat as the sidebar tab
    expect(parseAgentsWorkspaceSection(ACTIVITY_ROOT_PATH)).toBe("sessions");
  });

  it("parses the agents catalog path without treating it as an agent overview", () => {
    expect(parseAgentsWorkspaceSection(AGENTS_CATALOG_ROOT_PATH)).toBe(
      "agents-catalog"
    );
    expect(
      parseAgentsWorkspaceSection(`${AGENTS_CATALOG_ROOT_PATH}/dynamic`)
    ).toBe("agents-catalog");
    expect(
      parseAgentsWorkspaceSection(`${AGENTS_CATALOG_ROOT_PATH}/agent-1/edit`)
    ).toBe("agents-catalog");
  });

  it("parses the skills catalog and tools management paths", () => {
    expect(
      parseAgentsWorkspaceSection(`${AGENTS_WORKSPACE_ROOT_PATH}/skills`)
    ).toBe("skills");
    expect(
      parseAgentsWorkspaceSection(
        `${AGENTS_WORKSPACE_ROOT_PATH}/skills/skill-1`
      )
    ).toBe("skills");
    // New tools path
    expect(
      parseAgentsWorkspaceSection(`${AGENTS_WORKSPACE_ROOT_PATH}/tools`)
    ).toBe("tools");
    expect(
      parseAgentsWorkspaceSection(
        `${AGENTS_WORKSPACE_ROOT_PATH}/tools/tool-1/edit`
      )
    ).toBe("tools");
    // Legacy dynamic tools path still resolves to tools section
    expect(
      parseAgentsWorkspaceSection(`${AGENTS_WORKSPACE_ROOT_PATH}/tools/dynamic`)
    ).toBe("tools");
  });

  it("returns null for unrelated paths", () => {
    expect(parseAgentsWorkspaceSection("/settings/ai")).toBeNull();
  });
});

describe("parseAgentSessionDetailFromPathname", () => {
  it("parses agent and thread ids from a session detail path", () => {
    expect(
      parseAgentSessionDetailFromPathname(
        `${AGENTS_CATALOG_ROOT_PATH}/agent-1/sessions/session-99`
      )
    ).toEqual({ agentId: "agent-1", threadId: "session-99" });
  });

  it("returns null for sessions list and catalog paths", () => {
    expect(
      parseAgentSessionDetailFromPathname(
        `${AGENTS_CATALOG_ROOT_PATH}/agent-1/sessions`
      )
    ).toBeNull();
    expect(parseAgentSessionDetailFromPathname(ACTIVITY_ROOT_PATH)).toBeNull();
  });
});

describe("route builders", () => {
  it("builds agent detail routes under /agents/:agentId", () => {
    expect(buildAgentDetailPath("agent-1")).toBe(
      `${AGENTS_CATALOG_ROOT_PATH}/agent-1`
    );
    expect(buildAgentInstructionsPath("agent-1", { file: "AGENTS.md" })).toBe(
      `${AGENTS_CATALOG_ROOT_PATH}/agent-1/instructions?file=AGENTS.md`
    );
    expect(buildAgentSessionsPath("agent-1")).toBe(
      `${AGENTS_CATALOG_ROOT_PATH}/agent-1/sessions`
    );
    expect(buildAgentSessionsPath("agent-1", { filter: "running" })).toBe(
      `${AGENTS_CATALOG_ROOT_PATH}/agent-1/sessions?filter=running`
    );
    expect(buildAgentSessionDetailPath("agent-1", "session-99")).toBe(
      `${AGENTS_CATALOG_ROOT_PATH}/agent-1/sessions/session-99`
    );
    expect(
      buildAgentSessionDetailPath("agent-1", "session-99", { filter: "x" })
    ).toBe(`${AGENTS_CATALOG_ROOT_PATH}/agent-1/sessions/session-99?filter=x`);
  });

  it("builds skill detail routes", () => {
    expect(buildSkillDetailPath("skill-1")).toBe(
      `${AGENTS_WORKSPACE_ROOT_PATH}/skills/skill-1`
    );
    expect(buildSkillDetailPath("skill-1", { file: "SKILL.md" })).toBe(
      `${AGENTS_WORKSPACE_ROOT_PATH}/skills/skill-1?file=SKILL.md`
    );
    expect(
      buildSkillDetailPath("skill-1", { file: "SKILL.md", view: "code" })
    ).toBe(
      `${AGENTS_WORKSPACE_ROOT_PATH}/skills/skill-1?file=SKILL.md&view=code`
    );
    expect(buildSkillDetailPath("skill-1", { view: "code" })).toBe(
      `${AGENTS_WORKSPACE_ROOT_PATH}/skills/skill-1?view=code`
    );
  });

  it("builds catalog paths", () => {
    expect(buildAgentsCatalogPath()).toBe(AGENTS_CATALOG_ROOT_PATH);
  });
});
