import { describe, expect, it } from "vitest";
import {
  assertSpaceAgentLimit,
  SpaceAgentLimitError,
  type SpaceMount,
  surfaceFromMounts,
} from "./space-mounts.js";

const SPACE = "99999999-9999-4999-8999-999999999999";
const TENANT = "11111111-1111-4111-8111-111111111111";
// Since CN.3 a connection mount's key is an ACCOUNT id, not a connector id.
const CONNECTION_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CONNECTION_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function mount(
  partial: Partial<SpaceMount> &
    Pick<SpaceMount, "resourceType" | "resourceKey">
): SpaceMount {
  return {
    agentAccess: null,
    createdAt: "2026-08-10T00:00:00Z",
    isRequired: false,
    recordScope: null,
    reportsTo: null,
    spaceId: SPACE,
    tenantId: TENANT,
    ...partial,
  };
}

describe("surfaceFromMounts", () => {
  it("projects all four resource kinds and counts them once", () => {
    const surface = surfaceFromMounts(SPACE, [
      mount({
        agentAccess: "write",
        recordScope: "space",
        resourceKey: "offers",
        resourceType: "module",
      }),
      mount({
        agentAccess: "none",
        recordScope: "all",
        resourceKey: "contacts",
        resourceType: "module",
      }),
      mount({ resourceKey: "contacts.manager", resourceType: "agent" }),
      mount({ resourceKey: "sandbox-code-execution", resourceType: "skill" }),
      mount({ resourceKey: CONNECTION_A, resourceType: "connection" }),
    ]);

    expect(surface.counts).toEqual({
      agents: 1,
      connections: 1,
      modules: 2,
      skills: 1,
    });
    expect(surface.agents).toEqual(["contacts.manager"]);
    expect(surface.skills).toEqual(["sandbox-code-execution"]);
    expect(surface.connections).toEqual([CONNECTION_A]);
  });

  it("counts a module the engentys cannot touch — the tab and the grant are different questions", () => {
    // `contacts` is mounted with agent_access 'none': it shows up for humans in
    // the Apps tab (so it counts) but contributes no capability. If these two
    // ever came from different queries, the setup dialog would claim access the
    // agent does not have.
    const surface = surfaceFromMounts(SPACE, [
      mount({
        agentAccess: "none",
        recordScope: "space",
        resourceKey: "contacts",
        resourceType: "module",
      }),
    ]);
    expect(surface.counts.modules).toBe(1);
    expect(surface.capabilities).toEqual([]);
  });

  it("derives the capability set from the SAME rows the counts come from", () => {
    const surface = surfaceFromMounts(SPACE, [
      mount({
        agentAccess: "write",
        recordScope: "space",
        resourceKey: "offers",
        resourceType: "module",
      }),
      mount({ resourceKey: CONNECTION_A, resourceType: "connection" }),
    ]);
    // The connection mount contributes NOTHING without the connector lookup:
    // capabilities are connector-shaped, and an account id is not a connector.
    // Silence here is the honest answer — see the next test for the resolved
    // case, and CN.3 for why the mount key changed at all.
    expect(surface.capabilities).toEqual([
      "module.offers.read",
      "module.offers.write",
    ]);
  });

  it("resolves a mounted ACCOUNT to its connector's capabilities (CN.3)", () => {
    const surface = surfaceFromMounts(
      SPACE,
      [
        mount({ resourceKey: CONNECTION_A, resourceType: "connection" }),
        mount({ resourceKey: CONNECTION_B, resourceType: "connection" }),
      ],
      // Two accounts of the SAME connector: the capability set must not gain a
      // duplicate, because two mailboxes are one connector's worth of reach.
      new Map([
        [CONNECTION_A, "google-gmail"],
        [CONNECTION_B, "google-gmail"],
      ])
    );
    expect(surface.connections).toEqual([CONNECTION_A, CONNECTION_B]);
    expect(surface.connectors).toEqual(["google-gmail"]);
    expect(surface.capabilities).toEqual([
      "module.connections.read.google-gmail",
      "module.connections.write.google-gmail",
    ]);
  });

  it("drops a mounted account that no longer resolves — fails shut", () => {
    const surface = surfaceFromMounts(SPACE, [
      mount({ resourceKey: CONNECTION_A, resourceType: "connection" }),
    ]);
    // The account was deleted, or the mount predates CN.3 and still holds a
    // connector id. Either way it grants no connector; the mount stays visible
    // in the surface so it can be seen and removed.
    expect(surface.connections).toEqual([CONNECTION_A]);
    expect(surface.connectors).toEqual([]);
    expect(surface.capabilities).toEqual([]);
  });

  it("treats a plugin mount as an enabled connector with no account", () => {
    const surface = surfaceFromMounts(SPACE, [
      mount({ resourceKey: "google-gmail", resourceType: "plugin" }),
    ]);
    expect(surface.connections).toEqual([]);
    expect(surface.connectors).toEqual(["google-gmail"]);
    expect(surface.capabilities).toEqual([
      "module.connections.read.google-gmail",
      "module.connections.write.google-gmail",
    ]);
  });

  it("unions all-spaces connector ids into the surface", () => {
    const surface = surfaceFromMounts(
      SPACE,
      [mount({ resourceKey: CONNECTION_A, resourceType: "connection" })],
      new Map([[CONNECTION_A, "google-gmail"]]),
      new Map(),
      ["slack"]
    );
    expect(surface.connectors).toEqual(["google-gmail", "slack"]);
  });

  it("returns an empty surface for a space with no mounts", () => {
    const surface = surfaceFromMounts(SPACE, []);
    expect(surface.counts).toEqual({
      agents: 0,
      connections: 0,
      modules: 0,
      skills: 0,
    });
    expect(surface.capabilities).toEqual([]);
    expect(surface.spaceId).toBe(SPACE);
  });

  it("emits named facets when a tasks module is mounted for agents", () => {
    const surface = surfaceFromMounts(SPACE, [
      mount({
        agentAccess: "write",
        recordScope: "space",
        resourceKey: "tasks",
        resourceType: "module",
      }),
    ]);
    expect(surface.capabilities).toEqual([
      "module.tasks.read",
      "module.tasks.write",
    ]);
  });

  it("keeps record_scope per module — it is a default filter, not a move", () => {
    const surface = surfaceFromMounts(SPACE, [
      mount({
        agentAccess: "read",
        recordScope: "all",
        resourceKey: "contacts",
        resourceType: "module",
      }),
    ]);
    expect(surface.modules[0]).toEqual({
      agentAccess: "read",
      isRequired: false,
      moduleId: "contacts",
      recordScope: "all",
    });
  });
});

describe("top-level agents", () => {
  it("lists hired agents with no reports_to, never the baseline", () => {
    const surface = surfaceFromMounts(SPACE, [
      mount({ resourceKey: "engenty.copilot", resourceType: "agent" }),
      mount({ resourceKey: "chief-of-staff", resourceType: "agent" }),
      mount({
        reportsTo: "chief-of-staff",
        resourceKey: "inbox.triage",
        resourceType: "agent",
      }),
      mount({ reportsTo: "  ", resourceKey: "scout", resourceType: "agent" }),
    ]);
    expect(surface.topLevelAgents).toEqual(["chief-of-staff", "scout"]);
    expect(surface.agents).toContain("inbox.triage");
  });
});

describe("assertSpaceAgentLimit", () => {
  const hired = (n: number) =>
    Array.from({ length: n }, (_, index) =>
      mount({ resourceKey: `agent-${index}`, resourceType: "agent" })
    );

  it("ignores baseline agents and re-mounts of an existing key", () => {
    const existing = [
      mount({ resourceKey: "engenty.copilot", resourceType: "agent" }),
      ...hired(20),
    ];
    expect(() =>
      assertSpaceAgentLimit(SPACE, existing, ["agent-3", "engenty.cli"])
    ).not.toThrow();
  });

  it("refuses the twenty-first hire", () => {
    expect(() =>
      assertSpaceAgentLimit(SPACE, hired(19), ["new"])
    ).not.toThrow();
    expect(() => assertSpaceAgentLimit(SPACE, hired(20), ["new"])).toThrow(
      SpaceAgentLimitError
    );
  });
});
