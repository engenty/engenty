import { describe, expect, it } from "vitest";
import {
  compareSpaceAgents,
  ENGENTY_COORDINATOR_AGENT_ID,
  ENGENTY_COPILOT_AGENT_ID,
  isSpaceAgentNavActive,
  isSpaceAgentsListActive,
  isSpaceRosterAgent,
  resolveSpaceAgentDeskRedirect,
  resolveSpaceAgentDestination,
  resolveSpaceAgentKind,
  resolveSpaceChatDestination,
} from "./space-agent-nav";

describe("resolveSpaceAgentDestination", () => {
  it("keeps the baseline Copilot in its full-page chat", () => {
    expect(resolveSpaceAgentDestination("engenty.copilot", "company")).toBe(
      "/s/company/copilot/chat"
    );
  });

  it("routes a leftover coordinator id to its Desk chat", () => {
    expect(resolveSpaceAgentDestination("engenty.coordinator", "company")).toBe(
      "/s/company/agents/engenty.coordinator"
    );
  });

  it("routes custom agents through the same Desk", () => {
    expect(resolveSpaceAgentDestination("custom.researcher", "company")).toBe(
      "/s/company/agents/custom.researcher"
    );
  });

  it("encodes Space keys", () => {
    expect(
      resolveSpaceAgentDestination("engenty.copilot", "Sales / DACH")
    ).toBe("/s/Sales%20%2F%20DACH/copilot/chat");
  });
});

describe("resolveSpaceAgentDeskRedirect", () => {
  it("redirects only the legacy Copilot desk to canonical Space chat", () => {
    expect(
      resolveSpaceAgentDeskRedirect(ENGENTY_COPILOT_AGENT_ID, "company")
    ).toBe("/s/company/copilot/chat");
    expect(
      resolveSpaceAgentDeskRedirect(ENGENTY_COORDINATOR_AGENT_ID, "company")
    ).toBeNull();
    expect(
      resolveSpaceAgentDeskRedirect("contacts.manager", "company")
    ).toBeNull();
  });
});

describe("isSpaceAgentsListActive", () => {
  it("marks only the roster page, not a desk or hire", () => {
    expect(isSpaceAgentsListActive("/s/company/agents", "company")).toBe(true);
    expect(
      isSpaceAgentsListActive(
        "/s/company/agents/engenty.coordinator",
        "company"
      )
    ).toBe(false);
    expect(isSpaceAgentsListActive("/s/company/agents/new", "company")).toBe(
      false
    );
    expect(isSpaceAgentsListActive("/s/company", "company")).toBe(false);
  });
});

describe("isSpaceAgentNavActive", () => {
  it("marks a leftover coordinator id on its Desk, not on the space home, Copilot, or settings", () => {
    expect(
      isSpaceAgentNavActive(
        "/s/company",
        ENGENTY_COORDINATOR_AGENT_ID,
        "company"
      )
    ).toBe(false);
    expect(
      isSpaceAgentNavActive(
        "/s/company/agents/engenty.coordinator",
        ENGENTY_COORDINATOR_AGENT_ID,
        "company"
      )
    ).toBe(true);
    expect(
      isSpaceAgentNavActive(
        "/s/company/copilot/chat",
        ENGENTY_COORDINATOR_AGENT_ID,
        "company"
      )
    ).toBe(false);
    expect(
      isSpaceAgentNavActive(
        "/s/company/settings",
        ENGENTY_COORDINATOR_AGENT_ID,
        "company"
      )
    ).toBe(false);
  });
});

describe("compareSpaceAgents", () => {
  it("orders the roster alphabetically by display name", () => {
    const roster = [
      { id: "tasks.assist", name: "Tasks Assist" },
      { id: "contacts.manager", name: "Contacts Manager" },
      { id: "invoices.manager", name: "Invoices Manager" },
    ].sort(compareSpaceAgents);

    expect(roster.map((agent) => agent.id)).toEqual([
      "contacts.manager",
      "invoices.manager",
      "tasks.assist",
    ]);
  });
});

describe("isSpaceRosterAgent", () => {
  it("keeps specialists, not Copilot", () => {
    expect(
      isSpaceRosterAgent({ id: ENGENTY_COPILOT_AGENT_ID, role: "copilot" })
    ).toBe(false);
    expect(
      isSpaceRosterAgent({
        id: ENGENTY_COORDINATOR_AGENT_ID,
        role: "coordinator",
      })
    ).toBe(true);
    expect(
      isSpaceRosterAgent({ id: "contacts.manager", role: "specialist" })
    ).toBe(true);
  });

  it("hides chat surfaces and delegated sub-agents", () => {
    expect(
      isSpaceRosterAgent({
        id: "knowledge-base.answers",
        role: "chat_surface",
      })
    ).toBe(false);
    expect(
      isSpaceRosterAgent({ id: "engenty.file-analyst", role: "delegated" })
    ).toBe(false);
    expect(isSpaceRosterAgent({ id: "engenty.cli", role: "delegated" })).toBe(
      false
    );
    expect(isSpaceRosterAgent({ id: "engenty.remote", role: "external" })).toBe(
      false
    );
    expect(
      isSpaceRosterAgent({ id: "chatbot.support", role: "external" })
    ).toBe(false);
  });
});

describe("where ONE conversation opens", () => {
  const THREAD = "33333333-3333-4333-8333-333333333333";

  it("puts the copilot's thread in the PATH, where its chat reads it", () => {
    expect(
      resolveSpaceChatDestination(ENGENTY_COPILOT_AGENT_ID, "company", THREAD)
    ).toBe(`/s/company/copilot/chat/${THREAD}`);
  });

  it("puts a desk's thread in `?engagement=`, where a desk reads it", () => {
    // Two shapes because the two surfaces address a thread differently; a row
    // that used one shape for both would open the right agent on no
    // conversation, which looks like the chat was lost.
    expect(
      resolveSpaceChatDestination(
        ENGENTY_COORDINATOR_AGENT_ID,
        "company",
        THREAD
      )
    ).toBe(
      `/s/company/agents/engenty.coordinator?engagement=conversation%3A${THREAD}`
    );
  });

  it("still lands on the agent's own destination", () => {
    const agentId = "contacts.manager";
    expect(resolveSpaceChatDestination(agentId, "company", THREAD)).toContain(
      resolveSpaceAgentDestination(agentId, "company")
    );
  });
});

describe("resolveSpaceAgentKind", () => {
  it("calls a delegated sub-agent delegated even though it ships with the platform", () => {
    // What matters to a reader is that nobody addresses it — the Work
    // sidebar hides it for the same reason.
    expect(
      resolveSpaceAgentKind({ id: "engenty.app-coder", role: "delegated" })
    ).toBe("delegated");
    expect(
      resolveSpaceAgentKind({ id: "engenty.cli", role: "delegated" })
    ).toBe("delegated");
    expect(
      resolveSpaceAgentKind({
        id: "knowledge-base.answers",
        role: "chat_surface",
      })
    ).toBe("delegated");
  });

  it("groups the shipped engentys as platform", () => {
    expect(
      resolveSpaceAgentKind({ id: ENGENTY_COPILOT_AGENT_ID, role: "copilot" })
    ).toBe("platform");
    expect(
      resolveSpaceAgentKind({
        id: ENGENTY_COORDINATOR_AGENT_ID,
        role: "coordinator",
      })
    ).toBe("platform");
    expect(
      resolveSpaceAgentKind({ id: "engenty.remote", role: "external" })
    ).toBe("platform");
  });

  it("separates an app's specialist from a hired agent", () => {
    expect(
      resolveSpaceAgentKind({
        id: "inbox.assist",
        managedByModule: "inbox",
        role: "specialist",
        source: "module",
      })
    ).toBe("module");
    expect(
      resolveSpaceAgentKind({
        id: "acme.researcher",
        role: "specialist",
        source: "database",
      })
    ).toBe("hired");
  });

  it("keeps a module-shipped platform engenty in platform", () => {
    // The Copilot lives in `modules/engenty-copilot`, so its source is
    // "module" — but it comes with Engenty and cannot be unmounted.
    expect(
      resolveSpaceAgentKind({
        id: ENGENTY_COPILOT_AGENT_ID,
        role: "copilot",
        source: "module",
      })
    ).toBe("platform");
  });
});
