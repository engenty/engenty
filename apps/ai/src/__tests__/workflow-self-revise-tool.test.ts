import { beforeEach, describe, expect, it } from "vitest";
import { engentyToolsRunAls } from "../../ai/tools/engenty-tools/lib/run-context.js";
import {
  createWorkflowSelfReviseTools,
  WORKFLOW_SELF_REVISE_TOOL_ID,
} from "../../ai/tools/workflow-self-revise-tool.js";
import type {
  SaveVersionInput,
  WorkflowRow,
  WorkflowVersionRow,
} from "../dal/workflows/index.js";
import { testToolContext } from "./helpers/tool-context.js";

const AGENT_ID = "lernen.deutsch-grammatik";
const TENANT_ID = "tenant-1";
const WORKFLOW_ID = "019fe8ec-0000-0000-0000-0000000000d1";

/** The smallest graph the validator accepts: a mapping feeding a wait. */
const VALID_GRAPH = [
  {
    type: "mapping",
    id: "prep-wait",
    mapConfig: JSON.stringify({
      duration_ms: { value: 60_000 },
      reason: { value: "let the answer settle" },
    }),
  },
  { type: "tool", id: "wait", toolId: "wait_until" },
];

/** A page: the smallest graph a wizard accepts. */
const GATE_GRAPH = [
  {
    type: "mapping",
    id: "prep-ask",
    mapConfig: JSON.stringify({
      kind: { value: "confirm" },
      payload: { value: { tense: "Perfekt" } },
      title: { value: "Diese Zeitform?" },
    }),
  },
  { type: "tool", id: "ask", toolId: "approval_gate" },
];

function row(overrides: Partial<WorkflowRow> = {}): WorkflowRow {
  return {
    context_type: null,
    created_at: "2026-09-01T00:00:00Z",
    created_by_user_id: null,
    current_version: 1,
    description: "Grammatik-Drill",
    id: WORKFLOW_ID,
    module_id: null,
    name: "grammatik-drill",
    owner_agent_id: AGENT_ID,
    source_workflow_id: null,
    status: "active",
    surface: "chat",
    tenant_id: TENANT_ID,
    title: "Grammatik-Drill",
    updated_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

const saved: SaveVersionInput[] = [];
let stored: WorkflowRow | null = row();

const getStore = () => ({
  getGraph: async ({ id }: { id: string; tenantId: string }) =>
    stored && stored.id === id ? stored : null,
  listVersions: async () => [
    {
      input_schema: {
        properties: { tense: { type: "string" } },
        type: "object",
      },
      output_schema: { properties: {}, type: "object" },
      version: 1,
      workflow_id: WORKFLOW_ID,
    } as unknown as WorkflowVersionRow,
  ],
  saveVersion: async (input: SaveVersionInput) => {
    saved.push(input);
    return {
      id: "version-2",
      version: 2,
      workflow_id: WORKFLOW_ID,
    } as unknown as WorkflowVersionRow;
  },
});

function revise(input: Record<string, unknown>) {
  const tool =
    createWorkflowSelfReviseTools(getStore)[WORKFLOW_SELF_REVISE_TOOL_ID];
  return engentyToolsRunAls.run(
    {
      agentTypeKey: AGENT_ID,
      orchestratorThreadId: "thread-1",
      tenantId: TENANT_ID,
    },
    () =>
      tool.execute?.(
        {
          graph: VALID_GRAPH,
          summary: "Erst fragen, dann die Zeitform nennen",
          workflow_id: WORKFLOW_ID,
          ...input,
        },
        testToolContext()
      ) as Promise<Record<string, unknown>>
  );
}

describe(WORKFLOW_SELF_REVISE_TOOL_ID, () => {
  beforeEach(() => {
    saved.length = 0;
    stored = row();
  });

  it("mints an unapproved version of the Workflow it owns, keeping the schemas", async () => {
    const output = await revise({});

    expect(output.ok).toBe(true);
    expect(output.version).toBe(2);
    expect(saved).toHaveLength(1);
    expect(saved[0]?.workflowId).toBe(WORKFLOW_ID);
    // Inherited from v1 — a routine's static workflow_input must keep fitting.
    expect(saved[0]?.inputSchema).toEqual({
      properties: { tense: { type: "string" } },
      type: "object",
    });
    const graph = saved[0]?.graph as { id: string; graph: unknown[] };
    expect(graph.id).toBe(`workflow:${WORKFLOW_ID}`);
    expect(graph.graph).toEqual(VALID_GRAPH);
  });

  it("refuses a colleague's Workflow and a library one alike", async () => {
    stored = row({ owner_agent_id: "sales.researcher" });
    expect((await revise({})).code).toBe("not_yours");

    stored = row({ owner_agent_id: null });
    expect((await revise({})).code).toBe("not_yours");
    expect(saved).toHaveLength(0);
  });

  it("keeps the row's surface: a wizard stays a wizard and must keep a page", async () => {
    stored = row({ surface: "wizard" });

    const revised = await revise({ graph: GATE_GRAPH });
    expect(revised.ok).toBe(true);
    expect(revised.surface).toBe("wizard");

    // The same graph without a gate is a valid chat Workflow but not a wizard.
    const pageless = await revise({});
    expect(pageless.code).toBe("action_invalid");
    expect(
      (pageless.issues as { code: string }[]).map((issue) => issue.code)
    ).toContain("wizard-without-step");
    expect(saved).toHaveLength(1);
  });
});
