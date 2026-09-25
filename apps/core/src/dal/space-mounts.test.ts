import { describe, expect, it } from "vitest";
import {
  assertSpaceAgentLimit,
  SpaceAgentLimitError,
  type SpaceMount,
  surfaceFromMounts,
} from "./space-mounts.js";

const SPACE = "99999999-9999-4999-8999-999999999999";
const TENANT = "11111111-1111-4111-8111-111111111111";
// Accounts the space OWNS (module_connections.connections.space_id).
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
    ]);
    expect(surface.capabilities).toEqual([
      "module.offers.read",
      "module.offers.write",
    ]);
  });

  it("resolves the space's accounts to their connector's capabilities", () => {
    const surface = surfaceFromMounts(
      SPACE,
      [],
      // Two accounts of the SAME connector: the capability set must not gain a
      // duplicate, because two mailboxes are one connector's worth of reach.
      [
        { connectorId: "google-gmail", id: CONNECTION_A, status: "active" },
        { connectorId: "google-gmail", id: CONNECTION_B, status: "active" },
      ]
    );
    expect(surface.connections).toEqual([CONNECTION_A, CONNECTION_B]);
    expect(surface.connectors).toEqual(["google-gmail"]);
    expect(surface.capabilities).toEqual([
      "module.connections.read.google-gmail",
      "module.connections.write.google-gmail",
    ]);
  });

  it("lists an inactive account but enables no connector for it", () => {
    const surface = surfaceFromMounts(
      SPACE,
      [],
      [{ connectorId: "slack", id: CONNECTION_A, status: "revoked" }]
    );
    expect(surface.connections).toEqual([CONNECTION_A]);
    expect(surface.connectors).toEqual([]);
    expect(surface.capabilities).toEqual([]);
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

  it("refuses the twenty-first hire", () => {
    expect(() =>
      assertSpaceAgentLimit(SPACE, hired(19), ["new"])
    ).not.toThrow();
    expect(() => assertSpaceAgentLimit(SPACE, hired(20), ["new"])).toThrow(
      SpaceAgentLimitError
    );
  });
});
