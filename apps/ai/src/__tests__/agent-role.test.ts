import { describe, expect, it } from "vitest";
import {
  decorateAgentWithRole,
  resolveAgentRole,
  resolveManagedByModule,
} from "../api/agent-role.js";

describe("resolveAgentRole", () => {
  it("maps engenty.copilot to copilot", () => {
    expect(resolveAgentRole({ id: "engenty.copilot" })).toBe("copilot");
  });

  it("maps engenty.coordinator to coordinator", () => {
    expect(resolveAgentRole({ id: "engenty.coordinator" })).toBe("coordinator");
  });

  it("maps chatbot-synced agents to external", () => {
    expect(resolveAgentRole({ id: "chatbot.support-bot" })).toBe("external");
  });

  it("maps *.answers agents to chat_surface", () => {
    expect(resolveAgentRole({ id: "knowledge-base.answers" })).toBe(
      "chat_surface"
    );
  });

  it("maps everything else to specialist", () => {
    expect(resolveAgentRole({ id: "contacts.manager" })).toBe("specialist");
    expect(resolveAgentRole({ id: "my-custom-agent" })).toBe("specialist");
    expect(resolveAgentRole({ id: "tasks.assist" })).toBe("specialist");
  });
});

describe("resolveManagedByModule", () => {
  it("resolves chatbot prefix to chatbot module", () => {
    expect(resolveManagedByModule({ id: "chatbot.faq" })).toBe("chatbot");
  });

  it("returns null for unmanaged agents", () => {
    expect(resolveManagedByModule({ id: "engenty.copilot" })).toBeNull();
    expect(resolveManagedByModule({ id: "contacts.manager" })).toBeNull();
  });
});

describe("decorateAgentWithRole", () => {
  it("adds role and managed_by_module without dropping fields", () => {
    expect(
      decorateAgentWithRole({ id: "chatbot.faq", name: "FAQ Bot" })
    ).toEqual({
      id: "chatbot.faq",
      managed_by_module: "chatbot",
      name: "FAQ Bot",
      role: "external",
    });
  });
});
