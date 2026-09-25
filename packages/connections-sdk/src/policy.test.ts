import { describe, expect, it } from "vitest";
import {
  grantedOperationIds,
  resolveConnectionActionPolicy,
} from "./policy.js";
import type { ConnectionSummary } from "./types.js";

const MEMBER = "user-1";
const OTHER = "user-2";

function connection(
  patch: Partial<Pick<ConnectionSummary, "autonomous_mode">> = {}
) {
  return { autonomous_mode: "off" as const, ...patch };
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
          principal: user(MEMBER),
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
      principal: user(MEMBER),
    });
    expect(result).toEqual({ decision: "allow" });
  });

  it("group override applies when no action override exists", () => {
    const result = resolveConnectionActionPolicy({
      action: { group: "write", id: "other" },
      connection: connection(),
      isAutonomous: false,
      overrides: [{ policy: "deny", selector: "group:write" }],
      principal: user(MEMBER),
    });
    expect(result).toEqual({
      decision: "deny",
      reason: "connection_action_denied",
    });
  });

  it("does not care who signed in — any Space member resolves the same", () => {
    const result = resolveConnectionActionPolicy({
      action: { group: "write", id: "b" },
      connection: connection(),
      isAutonomous: false,
      overrides: [],
      principal: user(OTHER),
    });
    expect(result).toEqual({ decision: "ask" });
  });

  it("autonomous off denies everything; read_only denies non-read", () => {
    const conn = connection();
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
    const readOnly = connection({ autonomous_mode: "read_only" });
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
      connection: connection({ autonomous_mode: "full" }),
      isAutonomous: true,
      overrides: [],
      principal: user(OTHER),
    });
    expect(result).toEqual({ decision: "ask" });
  });
});

// The account's autonomous_mode is the only autonomy ceiling: live people in
// the Space are not clamped by it, and a service run is clamped the same way
// an agent run is.
describe("autonomy clamp", () => {
  const service = {
    principalId: "svc-1",
    principalType: "service",
  } as const;

  it("clamps a service run by autonomous_mode alone", () => {
    expect(
      resolveConnectionActionPolicy({
        action: { group: "write", id: "send" },
        connection: connection({ autonomous_mode: "read_only" }),
        isAutonomous: true,
        overrides: [{ policy: "allow", selector: "send" }],
        principal: service,
      })
    ).toEqual({ decision: "deny", reason: "connection_autonomous_read_only" });
    expect(
      resolveConnectionActionPolicy({
        action: { group: "write", id: "send" },
        connection: connection({ autonomous_mode: "full" }),
        isAutonomous: true,
        overrides: [{ policy: "allow", selector: "send" }],
        principal: service,
      })
    ).toEqual({ decision: "allow" });
  });

  it("does not clamp a person working in the Space", () => {
    expect(
      resolveConnectionActionPolicy({
        action: { group: "read", id: "list" },
        connection: connection({ autonomous_mode: "off" }),
        isAutonomous: false,
        overrides: [],
        principal: user(OTHER),
      })
    ).toEqual({ decision: "allow" });
  });

  it("an override cannot lift an account that is off", () => {
    expect(
      resolveConnectionActionPolicy({
        action: { group: "read", id: "list" },
        connection: connection({ autonomous_mode: "off" }),
        isAutonomous: true,
        overrides: [{ policy: "allow", selector: "list" }],
        principal: service,
      })
    ).toEqual({ decision: "deny", reason: "connection_autonomous_disabled" });
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
      principal: user(MEMBER),
      toolPrefix: "gmail",
    });
    expect(granted).toEqual(["gmail_draft"]);
  });
});
