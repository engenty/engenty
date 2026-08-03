import { describe, expect, it } from "vitest";
import { capabilityCovers } from "./capability-match.js";

describe("capabilityCovers", () => {
  it("honours the global wildcards", () => {
    for (const granted of [["*"], ["core.*"], ["core.superadmin"]]) {
      expect(capabilityCovers(granted, "module.connections.write.gmail")).toBe(
        true
      );
    }
  });

  it("matches the exact string", () => {
    expect(capabilityCovers(["module.tasks.write"], "module.tasks.write")).toBe(
      true
    );
  });

  it("matches a wildcard at any segment boundary", () => {
    const required = "module.connections.write.gmail";
    for (const granted of [
      "module.*",
      "module.connections.*",
      "module.connections.write.*",
    ]) {
      expect(capabilityCovers([granted], required)).toBe(true);
    }
  });

  it("does not let a wildcard reach across a sibling branch", () => {
    expect(
      capabilityCovers(
        ["module.connections.read.*"],
        "module.connections.write.gmail"
      )
    ).toBe(false);
    expect(
      capabilityCovers(
        ["module.connections.write.gmail"],
        "module.connections.write.slack"
      )
    ).toBe(false);
  });

  // The rule this matcher deliberately does not have. `team-chat.member` holds
  // a bare `module.team-chat` (modules/team-chat/src/plugin.ts), so a
  // "held capability covers its whole sub-tree" rule would have made every
  // member a manager. Widening must be written down as an explicit `.*`.
  it("does NOT treat a held capability as covering its sub-tree", () => {
    expect(
      capabilityCovers(["module.team-chat"], "module.team-chat.manage")
    ).toBe(false);
    expect(
      capabilityCovers(
        ["module.connections.write"],
        "module.connections.write.gmail"
      )
    ).toBe(false);
  });

  it("still refuses an unrelated capability", () => {
    expect(
      capabilityCovers(
        ["module.contacts.read", "tenant-settings.read"],
        "module.tasks.write"
      )
    ).toBe(false);
    expect(capabilityCovers([], "module.tasks.write")).toBe(false);
  });

  // AUTH-01's shape: `includes("*")` on a STRING is a substring test. Guard the
  // array contract so the scalar form can never come back.
  it("takes the whole granted set, never one entry", () => {
    // @ts-expect-error capabilityCovers takes string[], not a single capability
    expect(capabilityCovers("module.*", "core.users.impersonate")).toBe(true);
    expect(capabilityCovers(["module.*"], "core.users.impersonate")).toBe(
      false
    );
  });
});
