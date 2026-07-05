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

  it("personal connection denies non-owners regardless of policy", () => {
    const result = resolveConnectionActionPolicy({
      action: { group: "read", id: "a" },
      connection: connection(),
      isAutonomous: false,
      overrides: [{ policy: "allow", selector: "a" }],
      principal: user(OTHER),
    });
    expect(result).toEqual({
      decision: "deny",
      reason: "connection_personal_not_owner",
    });
  });

  it("org connection caps non-owners at non_owner_max_group", () => {
    const conn = connection({
      non_owner_max_group: "read",
      sharing: "org",
    });
    expect(
      resolveConnectionActionPolicy({
        action: { group: "read", id: "a" },
        connection: conn,
        isAutonomous: false,
        overrides: [],
        principal: user(OTHER),
      })
    ).toEqual({ decision: "allow" });
    expect(
      resolveConnectionActionPolicy({
        action: { group: "write", id: "b" },
        connection: conn,
        isAutonomous: false,
        overrides: [],
        principal: user(OTHER),
      })
    ).toEqual({
      decision: "deny",
      reason: "connection_non_owner_group_cap",
    });
    // The owner is not capped.
    expect(
      resolveConnectionActionPolicy({
        action: { group: "write", id: "b" },
        connection: conn,
        isAutonomous: false,
        overrides: [],
        principal: user(OWNER),
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
