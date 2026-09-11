import { describe, expect, it } from "vitest";
import type { AiRegisteredAction } from "../../../lib/admin/ai-runtime-types.js";
import type { WorkflowDto } from "../workflow-api.js";
import {
  buildFlowCatalog,
  FLOW_FILTER_ALL,
  FLOW_SUBJECT_NONE,
  filterFlows,
  getFlowSubjects,
  libraryActions,
  libraryWorkflows,
} from "../workflow-flows-state.js";

function flow(overrides: Partial<WorkflowDto>): WorkflowDto {
  return {
    context_type: null,
    created_at: "2026-08-01T00:00:00.000Z",
    current_version: 1,
    description: null,
    id: overrides.name ?? "id",
    module_id: null,
    name: "Flow",
    status: "draft",
    updated_at: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function action(overrides: Partial<AiRegisteredAction>): AiRegisteredAction {
  return {
    agent_id: null,
    allowed_tools: [],
    context_type: null,
    description: null,
    id: "contacts.enhance-contact",
    input_schema_json: { type: "object" },
    module_id: "contacts",
    name: "Enhance contact",
    skills: [],
    ...overrides,
  };
}

const GRAPHS = [
  flow({ context_type: "offers.offer", name: "Bill an accepted offer" }),
  flow({
    description: "Nudge the customer politely",
    name: "Chase an unpaid invoice",
    status: "active",
  }),
  flow({ context_type: "contacts.person", name: "Welcome a new contact" }),
];

const ENTRIES = buildFlowCatalog(GRAPHS, []);

const BASE = {
  searchQuery: "",
  sourceFilter: FLOW_FILTER_ALL,
  statusFilter: FLOW_FILTER_ALL,
  subjectFilter: FLOW_FILTER_ALL,
} as const;

describe("buildFlowCatalog", () => {
  it("lists a declared module workflow that has never been compiled", () => {
    const entries = buildFlowCatalog([], [action({})]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      workflowId: "contacts.enhance-contact",
      graph: null,
      id: "contacts.enhance-contact",
      source: "module",
    });
  });

  it("shows a compiled action ONCE — as the flow that actually runs", () => {
    const compiled = flow({
      id: "graph-1",
      name: "Enhance contact",
      source_workflow_id: "contacts.enhance-contact",
      status: "active",
    });
    const entries = buildFlowCatalog([compiled], [action({})]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      workflowId: "contacts.enhance-contact",
      id: "graph-1",
      source: "module",
    });
  });

  it("marks a graph with no source action as authored", () => {
    expect(buildFlowCatalog([GRAPHS[0]!], [])[0]?.source).toBe("authored");
  });

  it("sorts by name across both sources", () => {
    const entries = buildFlowCatalog(GRAPHS, [action({ name: "Aardvark" })]);
    expect(entries.map((e) => e.name)).toEqual([
      "Aardvark",
      "Bill an accepted offer",
      "Chase an unpaid invoice",
      "Welcome a new contact",
    ]);
  });

  it("prefers a graph's display title over its stable key", () => {
    const entries = buildFlowCatalog(
      [flow({ name: "chase-unpaid-invoice", title: "Chase unpaid invoices" })],
      []
    );
    expect(entries[0]?.name).toBe("Chase unpaid invoices");
    expect(buildFlowCatalog([flow({ title: null })], [])[0]?.name).toBe("Flow");
  });
});

describe("library filters", () => {
  it("keeps only graphs with no owning specialist", () => {
    const shared = flow({ name: "Shared", owner_agent_id: null });
    const legacy = flow({ name: "No owner field" });
    const owned = flow({
      name: "Owned",
      owner_agent_id: "contacts.researcher",
    });
    expect(libraryWorkflows([shared, legacy, owned])).toEqual([shared, legacy]);
  });

  it("keeps only actions with no owning specialist", () => {
    const shared = action({});
    const owned = action({
      agent_id: "contacts.researcher",
      id: "contacts.owned",
    });
    expect(libraryActions([shared, owned])).toEqual([shared]);
  });
});

describe("getFlowSubjects", () => {
  it("lists only subjects that occur, sorted, without a null entry", () => {
    expect(getFlowSubjects(ENTRIES)).toEqual([
      "contacts.person",
      "offers.offer",
    ]);
  });
});

describe("filterFlows", () => {
  it("passes everything through when nothing is set", () => {
    expect(filterFlows(ENTRIES, BASE)).toHaveLength(3);
  });

  it("searches name and description", () => {
    expect(
      filterFlows(ENTRIES, { ...BASE, searchQuery: "  POLITELY " }).map(
        (e) => e.name
      )
    ).toEqual(["Chase an unpaid invoice"]);
    expect(
      filterFlows(ENTRIES, { ...BASE, searchQuery: "offer" }).map((e) => e.name)
    ).toEqual(["Bill an accepted offer"]);
  });

  it("treats coding as a match for flows that talk about code", () => {
    const entries = [
      ...ENTRIES,
      {
        contextType: null,
        description: "Review pull requests and simplify code",
        graph: null,
        id: "review-code",
        moduleId: null,
        name: "Review code",
        source: "authored" as const,
        workflowId: null,
      },
    ];
    expect(
      filterFlows(entries, { ...BASE, searchQuery: "coding" }).map((e) => e.id)
    ).toEqual(["review-code"]);
  });

  it("filters by status", () => {
    expect(
      filterFlows(ENTRIES, { ...BASE, statusFilter: "active" }).map(
        (e) => e.name
      )
    ).toEqual(["Chase an unpaid invoice"]);
  });

  it("treats an uncompiled module workflow as its own status", () => {
    const entries = buildFlowCatalog(GRAPHS, [action({})]);
    expect(
      filterFlows(entries, { ...BASE, statusFilter: "declared" }).map(
        (e) => e.id
      )
    ).toEqual(["contacts.enhance-contact"]);
  });

  it("filters by source", () => {
    const entries = buildFlowCatalog(GRAPHS, [action({})]);
    expect(
      filterFlows(entries, { ...BASE, sourceFilter: "module" }).map((e) => e.id)
    ).toEqual(["contacts.enhance-contact"]);
    expect(
      filterFlows(entries, { ...BASE, sourceFilter: "authored" })
    ).toHaveLength(3);
  });

  it("filters by subject, and by having no subject at all", () => {
    expect(
      filterFlows(ENTRIES, { ...BASE, subjectFilter: "offers.offer" }).map(
        (e) => e.name
      )
    ).toEqual(["Bill an accepted offer"]);
    expect(
      filterFlows(ENTRIES, { ...BASE, subjectFilter: FLOW_SUBJECT_NONE }).map(
        (e) => e.name
      )
    ).toEqual(["Chase an unpaid invoice"]);
  });

  it("combines filters", () => {
    expect(
      filterFlows(ENTRIES, {
        searchQuery: "chase",
        sourceFilter: FLOW_FILTER_ALL,
        statusFilter: "draft",
        subjectFilter: FLOW_FILTER_ALL,
      })
    ).toEqual([]);
  });
});
