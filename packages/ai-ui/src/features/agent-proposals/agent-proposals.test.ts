// selectPendingProposals contract: proposed rows surface as new agents,
// active rows with proposed_config surface as revisions (revision fields win
// over the live config), everything else (plain active, archived) is silent.

import { describe, expect, it } from "vitest";
import {
  type AgentRecord,
  selectPendingProposals,
} from "./agent-proposals-api.js";

function record(overrides: Partial<AgentRecord> = {}): AgentRecord {
  return {
    config: {
      id: "sales.researcher",
      name: "Sales Researcher",
      description: "Researches prospects",
      instructions: "Research prospects before outreach.",
      model: "openai/gpt-5-mini",
      toolIds: ["engenty_tools_search"],
      skillIds: [],
    },
    created_by_agent: "engenty.coordinator",
    proposed_config: null,
    proposed_space_id: null,
    status: "active",
    updated_at: "2026-07-21T10:00:00Z",
    ...overrides,
  };
}

describe("selectPendingProposals", () => {
  it("surfaces proposed rows as new agents and skips plain active/archived", () => {
    const pending = selectPendingProposals([
      record({ status: "proposed" }),
      record({
        config: { ...record().config, id: "ops.helper" },
        status: "active",
      }),
      record({
        config: { ...record().config, id: "old.agent" },
        status: "archived",
      }),
    ]);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      agentId: "sales.researcher",
      kind: "new_agent",
      createdByAgent: "engenty.coordinator",
      proposedSpaceId: null,
      toolIds: ["engenty_tools_search"],
    });
  });

  it("carries proposed_space_id on new agents only", () => {
    const pending = selectPendingProposals([
      record({
        proposed_space_id: "00000000-0000-4000-8000-000000000010",
        status: "proposed",
      }),
      record({
        proposed_config: { name: "v2" },
        proposed_space_id: "00000000-0000-4000-8000-000000000010",
      }),
    ]);
    const created = pending.find((row) => row.kind === "new_agent");
    const revision = pending.find((row) => row.kind === "revision");
    expect(created?.proposedSpaceId).toBe(
      "00000000-0000-4000-8000-000000000010"
    );
    expect(revision?.proposedSpaceId).toBeNull();
  });

  it("surfaces pending revisions with revision fields winning over live config", () => {
    const pending = selectPendingProposals([
      record({
        proposed_config: {
          name: "Sales Researcher v2",
          instructions: "Sharper mandate.",
          tool_ids: ["engenty_tools_search", "web_search"],
        },
      }),
    ]);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      kind: "revision",
      name: "Sales Researcher v2",
      instructions: "Sharper mandate.",
      toolIds: ["engenty_tools_search", "web_search"],
      // Falls back to the live config where the revision omits a field.
      description: "Researches prospects",
    });
  });

  it("sorts newest first", () => {
    const pending = selectPendingProposals([
      record({ status: "proposed", updated_at: "2026-07-20T00:00:00Z" }),
      record({
        config: { ...record().config, id: "ops.helper" },
        status: "proposed",
        updated_at: "2026-07-21T00:00:00Z",
      }),
    ]);
    expect(pending.map((p) => p.agentId)).toEqual([
      "ops.helper",
      "sales.researcher",
    ]);
  });
});
