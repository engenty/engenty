import { describe, expect, it } from "vitest";
import type { WorkflowCatalogEntry } from "../workflow-canvas/workflow-flows-state";
import {
  countArtifacts,
  countFlows,
  countSkills,
  countTools,
  countWorkforce,
  previewNames,
} from "./overview-counts";

/** A catalog row in the given state; `null` = declared, never compiled. */
function entry(
  status: "active" | "draft" | "disabled" | null
): WorkflowCatalogEntry {
  return {
    workflowId: null,
    contextType: null,
    description: null,
    graph: status
      ? {
          context_type: null,
          created_at: "2026-08-01T00:00:00.000Z",
          current_version: 1,
          description: null,
          id: "g",
          module_id: null,
          name: "Flow",
          status,
          updated_at: "2026-08-01T00:00:00.000Z",
        }
      : null,
    id: "g",
    moduleId: null,
    name: "Flow",
    source: status ? "authored" : "module",
  };
}

describe("countWorkforce", () => {
  it("buckets agents by catalog group", () => {
    const counts = countWorkforce([
      { id: "engenty.copilot", name: "Copilot", role: "copilot" },
      { id: "engenty.coordinator", name: "Conductor", role: "coordinator" },
      {
        id: "contacts.manager",
        name: "CM",
        role: "specialist",
        source: "module",
      },
      { id: "kb.answers", name: "KB", role: "chat_surface" },
      { id: "faq", name: "FAQ", role: "external" },
      { id: "my-agent", name: "Mine", role: "specialist", source: "database" },
    ]);
    expect(counts).toEqual({
      chat_surfaces: 1,
      custom: 1,
      external: 1,
      leadership: 2,
      specialists: 1,
    });
  });

  it("returns zeros for an empty tenant", () => {
    expect(countWorkforce([])).toEqual({
      chat_surfaces: 0,
      custom: 0,
      external: 0,
      leadership: 0,
      specialists: 0,
    });
  });
});

describe("countSkills", () => {
  it("splits managed vs custom by tier", () => {
    expect(
      countSkills([
        { name: "a", tier: "managed" },
        { name: "b", tier: "custom" },
        { name: "c" },
      ])
    ).toEqual({ custom: 1, managed: 2, total: 3 });
  });
});

describe("countTools", () => {
  it("counts by derived source category", () => {
    expect(
      countTools([
        { id: "t1", name: "t1" },
        { id: "t2", name: "t2", engenty_mcp_app: "linear" },
        { id: "t3", name: "t3", source: "contacts" },
      ])
    ).toEqual({ custom: 1, mcp: 1, module: 1, total: 3 });
  });
});

describe("countFlows", () => {
  it("splits live vs draft", () => {
    expect(
      countFlows([entry("active"), entry("draft"), entry("draft")])
    ).toEqual({ declared: 0, draft: 2, live: 1, ready: 1, total: 3 });
  });

  it("counts a disabled flow in the total but as neither live nor draft", () => {
    expect(countFlows([entry("disabled")])).toEqual({
      declared: 0,
      draft: 0,
      live: 0,
      ready: 0,
      total: 1,
    });
  });

  // An uncompiled module workflow is READY: it runs on first use, and the missing
  // graph row is compile-on-use plumbing rather than a state anyone manages.
  // The card counts readiness for exactly this reason.
  it("counts an uncompiled module workflow as declared AND ready", () => {
    expect(countFlows([entry(null)])).toEqual({
      declared: 1,
      draft: 0,
      live: 0,
      ready: 1,
      total: 1,
    });
  });

  it("counts compiled and never-compiled actions alike as ready", () => {
    expect(countFlows([entry("active"), entry(null), entry("draft")])).toEqual(
      expect.objectContaining({ draft: 1, ready: 2, total: 3 })
    );
  });
});

describe("countArtifacts", () => {
  it("splits agent-authored from user-authored", () => {
    expect(
      countArtifacts([
        { created_by_kind: "agent" },
        { created_by_kind: "agent" },
        { created_by_kind: "user" },
      ])
    ).toEqual({ agent: 2, total: 3, user: 1 });
  });
});

describe("previewNames", () => {
  it("returns at most the limit", () => {
    expect(
      previewNames([{ name: "a" }, { name: "b" }, { name: "c" }, { name: "d" }])
    ).toEqual(["a", "b", "c"]);
  });
});
