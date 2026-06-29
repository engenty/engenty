import { describe, expect, it } from "vitest";
import {
  getAgentDetailAffordances,
  resolveAgentDetailTab,
} from "./agent-detail-tabs";

describe("resolveAgentDetailTab", () => {
  it("maps overview-ish sections to overview", () => {
    expect(resolveAgentDetailTab("agents-catalog")).toBe("overview");
    expect(resolveAgentDetailTab("landing")).toBe("overview");
  });

  it("maps instructions to instructions", () => {
    expect(resolveAgentDetailTab("instructions")).toBe("instructions");
  });

  it("keeps /sessions as an alias of the activity tab", () => {
    expect(resolveAgentDetailTab("sessions")).toBe("activity");
    expect(resolveAgentDetailTab("activity")).toBe("activity");
  });

  it("maps capabilities to its tab", () => {
    expect(resolveAgentDetailTab("capabilities")).toBe("capabilities");
  });
});

describe("getAgentDetailAffordances", () => {
  it("shows the chat-active toggle only for the registry copilot", () => {
    expect(
      getAgentDetailAffordances({
        agent_origin: "registry",
        id: "engenty.copilot",
        role: "copilot",
      }).showChatActiveToggle
    ).toBe(true);
    expect(
      getAgentDetailAffordances({
        agent_origin: "registry",
        id: "contacts.worker",
        role: "specialist",
      }).showChatActiveToggle
    ).toBe(false);
  });

  it("external agents are read-only with overview only", () => {
    const result = getAgentDetailAffordances({
      agent_origin: "registry",
      id: "chatbot.support",
      role: "external",
    });
    expect(result.isExternal).toBe(true);
    expect(result.canEditAgent).toBe(false);
    expect(result.visibleTabs).toEqual(["overview"]);
  });

  it("custom agents are editable and show all tabs", () => {
    const result = getAgentDetailAffordances({
      agent_origin: "custom",
      id: "my.agent",
    });
    expect(result.canEditAgent).toBe(true);
    expect(result.visibleTabs).toEqual([
      "overview",
      "capabilities",
      "instructions",
      "workspace",
      "activity",
    ]);
  });

  it("handles null agent", () => {
    const result = getAgentDetailAffordances(null);
    expect(result.canEditAgent).toBe(false);
    expect(result.isExternal).toBe(false);
    expect(result.showChatActiveToggle).toBe(false);
  });
});
