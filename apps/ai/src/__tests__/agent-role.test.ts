import { describe, expect, it } from "vitest";
import {
  decorateAgentWithRole,
  resolveAgentCanExecute,
  resolveAgentRole,
  resolveManagedByModule,
} from "../api/agent-role.js";

describe("resolveAgentRole", () => {
  // The display role derives from the DECLARED kind/interfaceRole — never
  // from the id string.
  it("maps a live interface agent to copilot", () => {
    expect(
      resolveAgentRole({
        id: "engenty.copilot",
        interfaceRole: "live",
        kind: "interface",
      })
    ).toBe("copilot");
  });

  it("maps a background interface agent to coordinator", () => {
    expect(
      resolveAgentRole({
        id: "engenty.coordinator",
        interfaceRole: "background",
        kind: "interface",
      })
    ).toBe("coordinator");
  });

  it("maps a remote interface agent to external", () => {
    expect(
      resolveAgentRole({
        id: "engenty.remote",
        interfaceRole: "remote",
        kind: "interface",
      })
    ).toBe("external");
  });

  it("maps chat_surface and delegated by their declared kind", () => {
    expect(
      resolveAgentRole({ id: "knowledge-base.answers", kind: "chat_surface" })
    ).toBe("chat_surface");
    expect(resolveAgentRole({ id: "engenty.cli", kind: "delegated" })).toBe(
      "delegated"
    );
  });

  it("maps everything else to specialist", () => {
    expect(
      resolveAgentRole({ id: "contacts.manager", kind: "specialist" })
    ).toBe("specialist");
    expect(resolveAgentRole({ id: "my-custom-agent" })).toBe("specialist");
  });
});

describe("resolveManagedByModule", () => {
  it("reads the declared moduleId", () => {
    expect(
      resolveManagedByModule({ id: "contacts.manager", moduleId: "contacts" })
    ).toBe("contacts");
  });

  it("returns null for unmanaged agents", () => {
    expect(resolveManagedByModule({ id: "engenty.copilot" })).toBeNull();
    expect(
      resolveManagedByModule({ id: "contacts.manager", moduleId: null })
    ).toBeNull();
  });
});

describe("decorateAgentWithRole", () => {
  it("adds the derived fields without dropping any", () => {
    expect(
      decorateAgentWithRole({
        id: "contacts.manager",
        kind: "specialist" as const,
        moduleId: "contacts",
        name: "Contacts Manager",
      })
    ).toEqual({
      can_execute: false,
      id: "contacts.manager",
      kind: "specialist",
      managed_by_module: "contacts",
      moduleId: "contacts",
      name: "Contacts Manager",
      role: "specialist",
    });
  });
});

describe("resolveAgentCanExecute", () => {
  it("is true only for an agent that declared an enabled sandbox", () => {
    // The Space's Compute settings offer a placement choice off this flag.
    // Most agents never execute anything, and offering them the choice wrote
    // a column nothing would ever read.
    expect(
      resolveAgentCanExecute({
        id: "engenty.cli",
        workspace: { sandbox: { enabled: true } },
      })
    ).toBe(true);
    expect(
      resolveAgentCanExecute({
        id: "engenty.coordinator",
        workspace: { sandbox: { enabled: false } },
      })
    ).toBe(false);
  });

  it("is false when the agent declares no sandbox at all", () => {
    expect(resolveAgentCanExecute({ id: "inbox.assist" })).toBe(false);
    expect(
      resolveAgentCanExecute({ id: "engenty.app-coder", workspace: {} })
    ).toBe(false);
    expect(
      resolveAgentCanExecute({ id: "offers.manager", workspace: null })
    ).toBe(false);
  });

  it("rides along on the decorated response", () => {
    expect(
      decorateAgentWithRole({
        id: "engenty.cli",
        workspace: { sandbox: { enabled: true } },
      })
    ).toMatchObject({ can_execute: true, role: "specialist" });
  });
});
