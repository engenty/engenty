import { describe, expect, it } from "vitest";
import { capabilityCovers } from "./capability-match.js";
import {
  AI_SERVICE_PLAN_CAPABILITIES,
  capabilitiesForModuleAccess,
  deriveSpaceAgentCapabilities,
} from "./space-grants.js";

describe("deriveSpaceAgentCapabilities", () => {
  it("grants nothing for agent_access 'none' — mounting is not granting", () => {
    // The whole reason `agent_access` is a column separate from the mount's
    // existence: a module can appear in the space's Apps tab for humans while
    // its engentys get no access to the data at all.
    expect(
      deriveSpaceAgentCapabilities({
        modules: [{ agentAccess: "none", moduleId: "offers" }],
      })
    ).toEqual([]);
  });

  it("grants nothing for 'none' even alongside a mounted write module", () => {
    // Per-module, not per-space: one generous mount must not leak into another.
    const granted = deriveSpaceAgentCapabilities({
      modules: [
        { agentAccess: "write", moduleId: "tasks" },
        { agentAccess: "none", moduleId: "secrets" },
      ],
    });
    expect(capabilityCovers(granted, "module.secrets.read")).toBe(false);
    expect(capabilityCovers(granted, "module.secrets.write")).toBe(false);
    expect(capabilityCovers(granted, "module.tasks.write")).toBe(true);
    expect(capabilityCovers(granted, "module.goals.read")).toBe(false);
    expect(capabilityCovers(granted, "module.goals.write")).toBe(false);
  });

  it("does not infer facets from the string — only MODULE_FACETS", () => {
    const granted = deriveSpaceAgentCapabilities({
      modules: [{ agentAccess: "read", moduleId: "goals" }],
    });
    expect(granted).toEqual(["module.goals.read"]);
    expect(capabilityCovers(granted, "module.tasks.read")).toBe(false);
  });

  it("makes write imply read", () => {
    expect(
      deriveSpaceAgentCapabilities({
        modules: [{ agentAccess: "write", moduleId: "offers" }],
      })
    ).toEqual(["module.offers.read", "module.offers.write"]);
  });

  it("keeps read from implying write", () => {
    const granted = deriveSpaceAgentCapabilities({
      modules: [{ agentAccess: "read", moduleId: "offers" }],
    });
    expect(granted).toEqual(["module.offers.read"]);
    expect(capabilityCovers(granted, "module.offers.write")).toBe(false);
  });

  it("scopes connectors per id and never wildcards", () => {
    const granted = deriveSpaceAgentCapabilities({
      connectors: ["google-gmail"],
      modules: [],
    });
    expect(granted).toContain("module.connections.write.google-gmail");
    // A space that mounts one connector must not thereby reach the rest.
    expect(granted).not.toContain("module.connections.write");
    expect(granted).not.toContain("module.connections.write.*");
    expect(capabilityCovers(granted, "module.connections.write.slack")).toBe(
      false
    );
  });

  it("NEGATIVE: an agent in space A cannot reach a connector mounted only in B", () => {
    // The checklist's headline negative. Two spaces, disjoint connector mounts;
    // A's derived grants must not cover B's connector under the matcher that
    // actually decides at runtime.
    const spaceA = deriveSpaceAgentCapabilities({
      connectors: ["google-gmail"],
      modules: [{ agentAccess: "write", moduleId: "offers" }],
    });
    const spaceB = deriveSpaceAgentCapabilities({
      connectors: ["slack"],
      modules: [{ agentAccess: "write", moduleId: "invoices" }],
    });
    expect(capabilityCovers(spaceA, "module.connections.write.slack")).toBe(
      false
    );
    expect(capabilityCovers(spaceA, "module.invoices.write")).toBe(false);
    expect(
      capabilityCovers(spaceB, "module.connections.write.google-gmail")
    ).toBe(false);
    expect(capabilityCovers(spaceB, "module.offers.read")).toBe(false);
  });

  it("is stable and de-duplicated", () => {
    const granted = deriveSpaceAgentCapabilities({
      connectors: ["gmail", "gmail"],
      modules: [
        { agentAccess: "write", moduleId: "offers" },
        { agentAccess: "read", moduleId: "offers" },
      ],
    });
    expect(granted).toEqual([...new Set(granted)]);
    expect(granted).toEqual([...granted].sort());
  });

  it("emits only the module namespace when MODULE_FACETS has no entry", () => {
    const granted = deriveSpaceAgentCapabilities({
      modules: [{ agentAccess: "read", moduleId: "tasks" }],
    });
    expect(granted).toEqual(["module.tasks.read"]);
    expect(capabilityCovers(granted, "module.goals.read")).toBe(false);
  });

  it("keeps the viewer pack on the same helper as the space mount", () => {
    expect(capabilitiesForModuleAccess("tasks", "read")).toEqual([
      "module.tasks.read",
    ]);
    expect(capabilitiesForModuleAccess("tasks", "write")).toEqual([
      "module.tasks.read",
      "module.tasks.write",
    ]);
  });

  it("names Plan caps a locked-down AI credential must list explicitly", () => {
    expect(AI_SERVICE_PLAN_CAPABILITIES).toEqual(
      capabilitiesForModuleAccess("tasks", "write")
    );
  });

  it("ignores blank ids rather than emitting `module..read`", () => {
    expect(
      deriveSpaceAgentCapabilities({
        connectors: ["  "],
        modules: [{ agentAccess: "write", moduleId: "  " }],
      })
    ).toEqual([]);
  });
});
