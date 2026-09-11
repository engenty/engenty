import { describe, expect, it } from "vitest";
import {
  defaultAgentRoleId,
  shouldAssignDefaultAgentRole,
} from "./default-agent-role.js";

const ROLES = new Set([
  "contacts.viewer",
  "contacts.editor",
  "tasks.viewer",
  "agent.assistant",
]);
const roleExists = (id: string) => ROLES.has(id);

describe("the role a new agent principal starts with", () => {
  it("is its own module's viewer", () => {
    expect(defaultAgentRoleId("contacts.manager", roleExists)).toBe(
      "contacts.viewer"
    );
  });

  it("is never the editor — writing stays a decision", () => {
    expect(defaultAgentRoleId("contacts.manager", roleExists)).not.toBe(
      "contacts.editor"
    );
  });

  it("is nothing for platform agents", () => {
    expect(defaultAgentRoleId("engenty.copilot", roleExists)).toBeNull();
  });

  it("is nothing when the module ships no viewer role", () => {
    expect(defaultAgentRoleId("payroll.manager", roleExists)).toBeNull();
  });

  it("is nothing for a key with no module prefix", () => {
    expect(defaultAgentRoleId("standalone", roleExists)).toBeNull();
    expect(defaultAgentRoleId("", roleExists)).toBeNull();
  });
});

describe("shouldAssignDefaultAgentRole", () => {
  it("assigns a module viewer only on create", () => {
    expect(
      shouldAssignDefaultAgentRole({
        agentTypeKey: "contacts.manager",
        assignedRoleIds: [],
        created: true,
        roleId: "contacts.viewer",
      })
    ).toBe(true);
    expect(
      shouldAssignDefaultAgentRole({
        agentTypeKey: "contacts.manager",
        assignedRoleIds: [],
        created: false,
        roleId: "contacts.viewer",
      })
    ).toBe(false);
  });
});
