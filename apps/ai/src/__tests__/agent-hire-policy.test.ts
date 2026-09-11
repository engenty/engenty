import { describe, expect, it } from "vitest";
import {
  hirePolicyGateReason,
  isLiveHireEligible,
  preferredSkillIdsForRun,
  withCatalogFloor,
  withLiveHirePresentationTools,
  withLiveHireSkills,
  withTopLevelHireSkills,
  withTopLevelHireTools,
} from "../../ai/tools/agent-hire-policy.js";

describe("isLiveHireEligible", () => {
  const spaceId = "00000000-0000-4000-8000-000000000010";

  it("allows a new hire with only base tools, no skills, and a space", () => {
    expect(
      isLiveHireEligible({
        existingActive: false,
        skillIds: [],
        spaceId,
        toolIds: ["engenty_tools_search", "engenty_tool_execute"],
      })
    ).toBe(true);
    expect(
      hirePolicyGateReason({
        existingActive: false,
        skillIds: [],
        spaceId,
        toolIds: ["engenty_tools_discover"],
      })
    ).toBe("allow_listed");
    expect(
      isLiveHireEligible({
        existingActive: false,
        skillIds: [],
        spaceId,
        toolIds: ["artifact_write", "table_write", "app_build"],
      })
    ).toBe(true);
  });

  it("rejects revisions, extra tools, skills, and a missing space", () => {
    expect(
      isLiveHireEligible({
        existingActive: true,
        skillIds: [],
        spaceId,
        toolIds: ["engenty_tools_search"],
      })
    ).toBe(false);
    expect(
      isLiveHireEligible({
        existingActive: false,
        skillIds: [],
        spaceId,
        toolIds: ["engenty_tools_search", "routines_create"],
      })
    ).toBe(false);
    expect(
      isLiveHireEligible({
        existingActive: false,
        skillIds: ["some-skill"],
        spaceId,
        toolIds: ["engenty_tools_search"],
      })
    ).toBe(false);
    expect(
      isLiveHireEligible({
        existingActive: false,
        skillIds: [],
        spaceId: null,
        toolIds: ["engenty_tools_search"],
      })
    ).toBe(false);
    expect(
      hirePolicyGateReason({
        existingActive: false,
        skillIds: [],
        spaceId,
        toolIds: ["routines_create"],
      })
    ).toBe("tools:routines_create");
  });

  it("attaches presentation tools after a live hire without gating the hire", () => {
    expect(withLiveHirePresentationTools(["engenty_tools_search"])).toEqual([
      "engenty_tools_search",
      "show_objects",
      "show_artifact",
    ]);
    expect(
      isLiveHireEligible({
        existingActive: false,
        skillIds: [],
        spaceId,
        toolIds: ["engenty_tools_search"],
      })
    ).toBe(true);
  });
});

// Live 2026-08-24: a hire declaring six module OPERATION ids replaced the
// catalog floor, so the agent ran with no engenty_tool_execute and reported it
// had no interface. Approvals are the boundary, so the floor is never dropped.
describe("withCatalogFloor", () => {
  it("restores the catalog path a narrower declaration would drop", () => {
    expect(withCatalogFloor(["inbox_threads_list"])).toEqual([
      "inbox_threads_list",
      "engenty_tools_search",
      "engenty_tools_discover",
      "engenty_tool_execute",
      "artifact_write",
      "artifact_read",
      "table_write",
      "table_read",
      "app_build",
      "routines_list",
      "routines_run",
      "routines_update",
      "workflows_list",
      "invoke_workflow",
      "message_agent",
      "agent_status",
      "web_search",
      "show_ui",
      "thread_state_set",
      "agent_self_revise",
      "workflow_self_revise",
    ]);
  });

  it("adds the floor to a hire that declared nothing", () => {
    expect(withCatalogFloor([])).toEqual([
      "engenty_tools_search",
      "engenty_tools_discover",
      "engenty_tool_execute",
      "artifact_write",
      "artifact_read",
      "table_write",
      "table_read",
      "app_build",
      "routines_list",
      "routines_run",
      "routines_update",
      "workflows_list",
      "invoke_workflow",
      "message_agent",
      "agent_status",
      "web_search",
      "show_ui",
      "thread_state_set",
      "agent_self_revise",
      "workflow_self_revise",
    ]);
  });

  it("keeps the go-live gate reading the REQUESTED tools", () => {
    // Flooring must not turn an extras-carrying hire into an automatic
    // activation: that decision still belongs to a human.
    expect(
      isLiveHireEligible({
        existingActive: false,
        skillIds: [],
        spaceId: "00000000-0000-4000-8000-000000000010",
        toolIds: ["inbox_threads_list"],
      })
    ).toBe(false);
  });

  it("does not duplicate a floor tool the hire already named", () => {
    expect(withCatalogFloor(["engenty_tool_execute"])).toEqual([
      "engenty_tool_execute",
      "engenty_tools_search",
      "engenty_tools_discover",
      "artifact_write",
      "artifact_read",
      "table_write",
      "table_read",
      "app_build",
      "routines_list",
      "routines_run",
      "routines_update",
      "workflows_list",
      "invoke_workflow",
      "message_agent",
      "agent_status",
      "web_search",
      "show_ui",
      "thread_state_set",
      "agent_self_revise",
      "workflow_self_revise",
    ]);
  });
});

describe("withLiveHireSkills", () => {
  it("prefers the floor tools' own playbooks on every live hire", () => {
    expect(withLiveHireSkills([])).toEqual([
      "space-data",
      "app-authoring",
      "engenty-bridge",
    ]);
    expect(withLiveHireSkills(["space-data", "contacts-search"])).toEqual([
      "space-data",
      "contacts-search",
      "app-authoring",
      "engenty-bridge",
    ]);
  });

  it("gives the prompt hint and the workspace filter one list", () => {
    expect(
      preferredSkillIdsForRun({ skillIds: [], source: "database" }, false)
    ).toEqual(["space-data", "app-authoring", "engenty-bridge"]);
    expect(
      preferredSkillIdsForRun({ skillIds: [], source: "database" }, true)
    ).toContain("chief-of-staff");
    expect(
      preferredSkillIdsForRun(
        { skillIds: ["kb-ingest"], source: "module" },
        true
      )
    ).toEqual(["kb-ingest"]);
  });
});

describe("top-level hire set", () => {
  it("adds the first engenty's setup and hiring tools on top of the floor", () => {
    const tools = withTopLevelHireTools(withCatalogFloor(["web_search"]));
    expect(tools).toContain("agent_propose");
    expect(tools).toContain("space_setup");
    expect(tools).toContain("routines_create");
    expect(tools).toContain("engenty_tool_execute");
    expect(new Set(tools).size).toBe(tools.length);
  });

  it("prefers the chief-of-staff skill once", () => {
    expect(withTopLevelHireSkills(["chief-of-staff", "space-data"])).toEqual([
      "chief-of-staff",
      "space-data",
    ]);
    expect(withTopLevelHireSkills([])).toEqual(["chief-of-staff"]);
  });
});
