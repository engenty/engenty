import { describe, expect, it } from "vitest";
import {
  AGENT_STARTER_MAX,
  agentStarterSchema,
  mergeGeneratedStarters,
  selectAgentDeskStarters,
  starterMatchesContext,
} from "./agent-starters.js";

const tracker = {
  id: "tt-log-today",
  label: "Log today's hours",
  prompt: "Log my hours for today.",
  locales: {
    de: {
      label: "Stunden für heute loggen",
      prompt: "Logge meine Stunden für heute.",
    },
  },
};

describe("agentStarterSchema", () => {
  it("accepts a catalogue entry with German overrides", () => {
    expect(agentStarterSchema.parse(tracker).id).toBe("tt-log-today");
  });

  it("rejects an oversized chip label", () => {
    expect(() =>
      agentStarterSchema.parse({
        ...tracker,
        label: "x".repeat(49),
      })
    ).toThrow();
  });
});

describe("selectAgentDeskStarters", () => {
  const context = {
    connectors: ["google-gmail"],
    firstVisit: false,
    hasOpenTasks: true,
    modules: [{ agentAccess: "write", moduleId: "inbox" }],
    spaceName: "Acme",
    userFirstName: "Ada",
  };

  it("falls back from de-AT to de then to the default", () => {
    const [deAt] = selectAgentDeskStarters([tracker], "de-AT", context);
    expect(deAt).toMatchObject({
      label: "Stunden für heute loggen",
      prompt: "Logge meine Stunden für heute.",
    });
    const [en] = selectAgentDeskStarters([tracker], "en", context);
    expect(en?.label).toBe("Log today's hours");
  });

  it("filters on connector / first visit and slices to three", () => {
    const starters = [
      {
        id: "mail",
        label: "Triage unread mail",
        prompt: "Triage unread mail in {space}.",
        when: { connector: "google-gmail" },
      },
      {
        id: "welcome",
        label: "Connect a mailbox",
        prompt: "Help {user_first_name} connect a mailbox.",
        when: { firstVisit: true },
      },
      {
        id: "search",
        label: "Search the inbox",
        prompt: "Search the inbox for last week's invoices.",
      },
      {
        id: "reply",
        label: "Draft a reply",
        prompt: "Draft a reply to the latest thread.",
        when: { connector: "google-gmail" },
      },
      {
        id: "extra",
        label: "Fourth job",
        prompt: "Should not appear.",
      },
    ];
    const shown = selectAgentDeskStarters(starters, "en", context);
    expect(shown.map((item) => item.id)).toEqual(["mail", "search", "reply"]);
    expect(shown).toHaveLength(AGENT_STARTER_MAX);
    expect(shown[0]?.prompt).toContain("Acme");
    expect(
      selectAgentDeskStarters(starters, "en", {
        ...context,
        connectors: [],
        firstVisit: true,
      }).map((item) => item.id)
    ).toEqual(["welcome", "search", "extra"]);
  });
});

describe("starterMatchesContext", () => {
  it("requires the module to be mounted with access", () => {
    expect(
      starterMatchesContext(
        { module: "tasks" },
        {
          connectors: [],
          firstVisit: true,
          hasOpenTasks: false,
          modules: [{ agentAccess: "none", moduleId: "tasks" }],
        }
      )
    ).toBe(false);
    expect(
      starterMatchesContext(
        { module: "tasks" },
        {
          connectors: [],
          firstVisit: true,
          hasOpenTasks: false,
          modules: [{ agentAccess: "read", moduleId: "tasks" }],
        }
      )
    ).toBe(true);
  });
});

describe("mergeGeneratedStarters", () => {
  it("keeps declared ids and appends new generated chips up to the cap", () => {
    const declared = [
      { id: "a", label: "A", prompt: "Do A." },
      { id: "b", label: "B", prompt: "Do B." },
    ];
    const generated = [
      { id: "a", label: "Generated A", prompt: "Replace A." },
      { id: "c", label: "C", prompt: "Do C." },
      { id: "d", label: "D", prompt: "Do D." },
    ];
    expect(mergeGeneratedStarters(declared, generated)).toEqual([
      { id: "a", label: "A", prompt: "Do A." },
      { id: "b", label: "B", prompt: "Do B." },
      { id: "c", label: "C", prompt: "Do C." },
    ]);
  });
});
