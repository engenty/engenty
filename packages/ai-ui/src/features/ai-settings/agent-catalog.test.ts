import { describe, expect, it } from "vitest";
import { buildAgentCatalogEntries } from "./agent-catalog";

describe("buildAgentCatalogEntries", () => {
  it("orders core agents before module agents, then by module_id and name", () => {
    const entries = buildAgentCatalogEntries({
      agents: [
        {
          description: null,
          id: "contacts.manager",
          instruction_keys: [],
          module_id: "contacts",
          name: "Contacts Manager",
          skills: [],
        },
        {
          description: null,
          id: "engenty.copilot",
          instruction_keys: [],
          module_id: "engenty",
          name: "Engenty",
          skills: [],
        },
        {
          description: null,
          id: "dashboard_widget_data",
          instruction_keys: [],
          module_id: "dashboard",
          name: "Dashboard Widget Data",
          skills: [],
        },
      ],
      documents: [],
    });

    expect(entries.map((e) => e.id)).toEqual([
      "dashboard_widget_data",
      "engenty.copilot",
      "contacts.manager",
    ]);
  });

  it("attaches copilot system documents even when owner metadata is absent", () => {
    const entries = buildAgentCatalogEntries({
      agents: [
        {
          description: null,
          id: "engenty.copilot",
          instruction_keys: [],
          module_id: "engenty",
          name: "Engenty",
          skills: [],
        },
      ],
      documents: [
        {
          body: "# Copilot",
          created_at: "2026-01-01T00:00:00.000Z",
          created_by_user_id: null,
          document_key: "engenty.copilot.agents",
          id: "doc-1",
          is_active: true,
          layer: "tenant",
          metadata: {},
          module_id: "engenty",
          source_kind: "seed",
          tenant_id: null,
          title: "Copilot instructions",
          updated_at: "2026-01-01T00:00:00.000Z",
          updated_by_user_id: null,
          version: 1,
        },
        {
          body: "# Soul",
          created_at: "2026-01-01T00:00:00.000Z",
          created_by_user_id: null,
          document_key: "engenty.copilot.soul",
          id: "doc-2",
          is_active: true,
          layer: "tenant",
          metadata: {},
          module_id: "engenty",
          source_kind: "seed",
          tenant_id: null,
          title: "Copilot soul",
          updated_at: "2026-01-01T00:00:00.000Z",
          updated_by_user_id: null,
          version: 1,
        },
      ],
    });

    expect(entries).toHaveLength(1);
    expect(
      entries[0]?.documents.map((document) => document.document_key)
    ).toEqual(["engenty.copilot.agents", "engenty.copilot.soul"]);
  });
});
