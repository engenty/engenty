import { describe, expect, it } from "vitest";
import {
  grantedOperationIds,
  resolveConnectionActionPolicy,
} from "./policy.js";
import type { ConnectionSummary } from "./types.js";

const OWNER = "user-1";
const OTHER = "user-2";

function connection(
  patch: Partial<
    Pick<
      ConnectionSummary,
      "autonomous_mode" | "non_owner_max_group" | "owner_user_id" | "sharing"
    >
  > = {}
) {
  return {
    autonomous_mode: "off" as const,
    non_owner_max_group: null,
    owner_user_id: OWNER,
    sharing: "personal" as const,
    ...patch,
  };
}

const user = (id: string) =>
  ({ principalId: id, principalType: "user" }) as const;

describe("resolveConnectionActionPolicy", () => {
  it("defaults: read allows, write asks, destructive asks", () => {
    for (const [group, decision] of [
      ["read", "allow"],
      ["write", "ask"],
      ["destructive", "ask"],
    ] as const) {
      expect(
        resolveConnectionActionPolicy({
          action: { group, id: "a" },
          connection: connection(),
          isAutonomous: false,
          overrides: [],
          principal: user(OWNER),
        })
      ).toEqual({ decision });
    }
  });

  it("action override beats group override beats default", () => {
    const result = resolveConnectionActionPolicy({
      action: { group: "write", id: "send" },
      connection: connection(),
      isAutonomous: false,
      overrides: [
        { policy: "deny", selector: "group:write" },
        { policy: "allow", selector: "send" },
      ],
      principal: user(OWNER),
    });
    expect(result).toEqual({ decision: "allow" });
  });

  it("group override applies when no action override exists", () => {
    const result = resolveConnectionActionPolicy({
      action: { group: "write", id: "other" },
      connection: connection(),
      isAutonomous: false,
      overrides: [{ policy: "deny", selector: "group:write" }],
      principal: user(OWNER),
    });
    expect(result).toEqual({
      decision: "deny",
      reason: "connection_action_denied",
    });
  });

  it("does not deny a non-owner based on the unused sharing column", () => {
    const result = resolveConnectionActionPolicy({
      action: { group: "read", id: "a" },
      connection: connection(),
      isAutonomous: false,
      overrides: [{ policy: "allow", selector: "a" }],
      principal: user(OTHER),
    });
    expect(result).toEqual({ decision: "allow" });
  });

  it("does not cap non-owners with non_owner_max_group", () => {
    const conn = connection({
      non_owner_max_group: "read",
      sharing: "org",
    });
    expect(
      resolveConnectionActionPolicy({
        action: { group: "write", id: "b" },
        connection: conn,
        isAutonomous: false,
        overrides: [],
        principal: user(OTHER),
      })
    ).toEqual({ decision: "ask" });
  });

  it("autonomous off denies everything; read_only denies non-read", () => {
    const conn = connection({ sharing: "org" });
    expect(
      resolveConnectionActionPolicy({
        action: { group: "read", id: "a" },
        connection: conn,
        isAutonomous: true,
        overrides: [],
        principal: user(OTHER),
      })
    ).toEqual({
      decision: "deny",
      reason: "connection_autonomous_disabled",
    });
    const readOnly = connection({
      autonomous_mode: "read_only",
      sharing: "org",
    });
    expect(
      resolveConnectionActionPolicy({
        action: { group: "read", id: "a" },
        connection: readOnly,
        isAutonomous: true,
        overrides: [],
        principal: user(OTHER),
      })
    ).toEqual({ decision: "allow" });
    expect(
      resolveConnectionActionPolicy({
        action: { group: "write", id: "b" },
        connection: readOnly,
        isAutonomous: true,
        overrides: [],
        principal: user(OTHER),
      })
    ).toEqual({
      decision: "deny",
      reason: "connection_autonomous_read_only",
    });
  });

  it("autonomous full keeps ask semantics for writes", () => {
    const result = resolveConnectionActionPolicy({
      action: { group: "write", id: "b" },
      connection: connection({ autonomous_mode: "full", sharing: "org" }),
      isAutonomous: true,
      overrides: [],
      principal: user(OTHER),
    });
    expect(result).toEqual({ decision: "ask" });
  });
});

// PLAN-connections-ux.md B1 — the space says how far, the account owner keeps
// the ceiling. The two halves are set in different places, so a denial has to
// say which one refused.
describe("space access level", () => {
  const orgFull = connection({ autonomous_mode: "full", sharing: "org" });

  it("clamps an autonomous run to the space's level", () => {
    expect(
      resolveConnectionActionPolicy({
        action: { group: "write", id: "send" },
        connection: orgFull,
        isAutonomous: true,
        overrides: [{ policy: "allow", selector: "send" }],
        principal: user(OTHER),
        spaceAccess: "read",
      })
    ).toEqual({
      decision: "deny",
      reason: "connection_space_access_read_only",
    });
    expect(
      resolveConnectionActionPolicy({
        action: { group: "read", id: "list" },
        connection: orgFull,
        isAutonomous: true,
        overrides: [],
        principal: user(OTHER),
        spaceAccess: "read",
      })
    ).toEqual({ decision: "allow" });
  });

  it("refuses outright when the space mounted the account for people only", () => {
    expect(
      resolveConnectionActionPolicy({
        action: { group: "read", id: "list" },
        connection: orgFull,
        isAutonomous: true,
        overrides: [],
        principal: user(OTHER),
        spaceAccess: "none",
      })
    ).toEqual({ decision: "deny", reason: "connection_space_access_none" });
  });

  it("keeps the account as the ceiling — a space cannot raise it", () => {
    const readOnlyAccount = connection({
      autonomous_mode: "read_only",
      sharing: "org",
    });
    expect(
      resolveConnectionActionPolicy({
        action: { group: "write", id: "send" },
        connection: readOnlyAccount,
        isAutonomous: true,
        overrides: [{ policy: "allow", selector: "send" }],
        principal: user(OTHER),
        spaceAccess: "write",
      })
    ).toEqual({ decision: "deny", reason: "connection_autonomous_read_only" });
  });

  it("an undecided space falls back to the account alone", () => {
    for (const spaceAccess of [null, undefined]) {
      expect(
        resolveConnectionActionPolicy({
          action: { group: "read", id: "list" },
          connection: connection({ sharing: "org" }),
          isAutonomous: true,
          overrides: [],
          principal: user(OTHER),
          spaceAccess,
        })
      ).toEqual({
        decision: "deny",
        reason: "connection_autonomous_disabled",
      });
    }
  });

  it("does not clamp a person working in the space", () => {
    expect(
      resolveConnectionActionPolicy({
        action: { group: "read", id: "list" },
        connection: orgFull,
        isAutonomous: false,
        overrides: [],
        principal: user(OTHER),
        spaceAccess: "none",
      })
    ).toEqual({ decision: "allow" });
  });
});

describe("grantedOperationIds", () => {
  it("returns only non-read actions the user durably allowed", () => {
    const granted = grantedOperationIds({
      actions: [
        { group: "read", id: "search" },
        { group: "write", id: "draft" },
        { group: "destructive", id: "send" },
      ],
      connection: connection(),
      isAutonomous: false,
      overrides: [
        { policy: "allow", selector: "draft" },
        { policy: "allow", selector: "search" }, // read: never emitted
      ],
      principal: user(OWNER),
      toolPrefix: "gmail",
    });
    expect(granted).toEqual(["gmail_draft"]);
  });
});

describe("actsForSpaceOwner (personal-space owner resolution, §2.1)", () => {
  const service = {
    principalId: "svc-1",
    principalType: "service",
  } as const;

  it("passes autonomous_mode for the space owner's account", () => {
    // The stand-in covers the clamp only; autonomous_mode still decides, so
    // an owner whose account is off stays off in their own space too.
    expect(
      resolveConnectionActionPolicy({
        action: { group: "read", id: "a" },
        actsForSpaceOwner: true,
        connection: connection({ autonomous_mode: "full" }),
        isAutonomous: true,
        overrides: [],
        principal: service,
      })
    ).toEqual({ decision: "allow" });
  });

  it("keeps the owner's autonomous_mode as the ceiling", () => {
    expect(
      resolveConnectionActionPolicy({
        action: { group: "read", id: "a" },
        actsForSpaceOwner: true,
        connection: connection({ autonomous_mode: "off" }),
        isAutonomous: true,
        overrides: [],
        principal: service,
      })
    ).toEqual({
      decision: "deny",
      reason: "connection_autonomous_disabled",
    });
  });

  it("keeps the space mount level as a clamp", () => {
    expect(
      resolveConnectionActionPolicy({
        action: { group: "write", id: "a" },
        actsForSpaceOwner: true,
        connection: connection({ autonomous_mode: "full" }),
        isAutonomous: true,
        overrides: [],
        principal: service,
        spaceAccess: "read",
      })
    ).toEqual({
      decision: "deny",
      reason: "connection_space_access_read_only",
    });
  });

  it("does not sharing-clamp a personal account the space owner does not own", () => {
    expect(
      resolveConnectionActionPolicy({
        action: { group: "read", id: "a" },
        actsForSpaceOwner: false,
        connection: connection({ autonomous_mode: "full" }),
        isAutonomous: true,
        overrides: [],
        principal: service,
      })
    ).toEqual({ decision: "allow" });
  });
});
