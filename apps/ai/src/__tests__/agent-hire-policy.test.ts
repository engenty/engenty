import { LIVE_HIRE_TOOL_IDS } from "@engenty/ai-core";
import { describe, expect, it } from "vitest";
import {
  agentCarriesCatalogFloor,
  effectiveToolGating,
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
        toolIds: ["engenty_tools_search", "space_setup"],
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
        toolIds: ["space_setup"],
      })
    ).toBe("tools:space_setup");
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
      ...LIVE_HIRE_TOOL_IDS,
    ]);
  });

  it("adds the floor to a hire that declared nothing", () => {
    expect(withCatalogFloor([])).toEqual([...LIVE_HIRE_TOOL_IDS]);
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
      ...LIVE_HIRE_TOOL_IDS.filter((id) => id !== "engenty_tool_execute"),
    ]);
  });
});

describe("withLiveHireSkills", () => {
  it("prefers the floor tools' own playbooks on every live hire", () => {
    expect(withLiveHireSkills([])).toEqual([
      "space-data",
      "app-authoring",
      "engenty-bridge",
      "routines",
    ]);
    expect(withLiveHireSkills(["space-data", "contacts-search"])).toEqual([
      "space-data",
      "contacts-search",
      "app-authoring",
      "engenty-bridge",
      "routines",
    ]);
  });

  it("gives the prompt hint and the workspace filter one list", () => {
    expect(
      preferredSkillIdsForRun({ skillIds: [], source: "database" }, false)
    ).toEqual(["space-data", "app-authoring", "engenty-bridge", "routines"]);
    expect(
      preferredSkillIdsForRun({ skillIds: [], source: "database" }, true)
    ).toContain("chief-of-staff");
    // A module specialist stands on the same floor as a hired one …
    expect(
      preferredSkillIdsForRun(
        { skillIds: ["kb-ingest"], source: "module" },
        false
      )
    ).toEqual([
      "kb-ingest",
      "space-data",
      "app-authoring",
      "engenty-bridge",
      "routines",
    ]);
    // … but a module's interface, delegate or chat surface keeps its list.
    expect(
      preferredSkillIdsForRun(
        { kind: "chat_surface", skillIds: ["kb-answer"], source: "module" },
        true
      )
    ).toEqual(["kb-answer"]);
    expect(
      preferredSkillIdsForRun(
        { kind: "interface", skillIds: [], source: "builtin" },
        true
      )
    ).toEqual([]);
  });
});

describe("agentCarriesCatalogFloor", () => {
  it("is every specialist, hired or module-shipped, and nothing else", () => {
    expect(agentCarriesCatalogFloor({ source: "database" })).toBe(true);
    expect(agentCarriesCatalogFloor({ source: "module" })).toBe(true);
    expect(
      agentCarriesCatalogFloor({ kind: "specialist", source: "module" })
    ).toBe(true);
    expect(
      agentCarriesCatalogFloor({ kind: "delegated", source: "module" })
    ).toBe(false);
    expect(
      agentCarriesCatalogFloor({ kind: "interface", source: "module" })
    ).toBe(false);
    expect(
      agentCarriesCatalogFloor({ kind: "chat_surface", source: "module" })
    ).toBe(false);
    expect(agentCarriesCatalogFloor({ source: "builtin" })).toBe(false);
  });
});

describe("effectiveToolGating", () => {
  it("gates the floor's lanes for every specialist, on top of the row's own", () => {
    const hired = effectiveToolGating({ source: "database" });
    expect(hired?.bySkill.routines).toContain("routines_create");
    expect(hired?.bySkill.routines).toContain("workflow_propose");
    expect(hired?.bySkill["space-data"]).toContain("table_write");
    // app_build rides with either playbook that needs it.
    expect(hired?.bySkill["app-authoring"]).toEqual(["app_build"]);
    expect(hired?.bySkill["space-data"]).toContain("app_build");

    const own = effectiveToolGating({
      source: "module",
      toolGating: {
        bySkill: { routines: ["kb_reindex"], "kb-ingest": ["kb_import"] },
      },
    });
    expect(own?.bySkill["kb-ingest"]).toEqual(["kb_import"]);
    expect(own?.bySkill.routines).toEqual(
      expect.arrayContaining(["kb_reindex", "routines_create"])
    );
  });

  it("leaves an interface or a delegate exactly as its row says", () => {
    expect(
      effectiveToolGating({ kind: "interface", source: "builtin" })
    ).toBeUndefined();
    expect(
      effectiveToolGating({
        kind: "delegated",
        source: "module",
        toolGating: { bySkill: { lane: ["x"] } },
      })
    ).toEqual({ bySkill: { lane: ["x"] } });
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
