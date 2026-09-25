// A specialist owns only its own routines; whether a person confirms first is
// the Space's approval mode, and a run nobody can answer is refused.
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetFrontendToolSuspendSlotsForTests } from "../../ai/frontend-tools/frontend-tool-suspend-lock.js";
import { engentyToolsRunAls } from "../../ai/tools/engenty-tools/lib/run-context.js";
import {
  createRoutineTools,
  ROUTINES_CREATE_TOOL_ID,
  ROUTINES_LIST_TOOL_ID,
  ROUTINES_UPDATE_TOOL_ID,
  type RoutineToolDeps,
} from "../../ai/tools/routines-tools.js";
import { promptOfWorkflowGraph } from "../ai/workflows/prompt-workflow.js";
import type {
  CreateRoutineOutcomeInput,
  RoutineOutcomeRow,
  RoutineOutcomeStore,
} from "../dal/routines/routine-outcome-store.js";
import type {
  CreateRoutineInput,
  RoutineRow,
  RoutineStore,
  UpdateRoutineInput,
} from "../dal/routines/routine-store.js";
import type {
  CreateRoutineTriggerInput,
  RoutineTriggerRow,
  RoutineTriggerStore,
} from "../dal/routines/routine-trigger-store.js";
import type {
  CreateWorkflowInput,
  SaveVersionInput,
  WorkflowRow,
  WorkflowStore,
  WorkflowVersionRow,
} from "../dal/workflows/workflow-store.js";

const TENANT = "tenant-1";
const SPACE = "00000000-0000-4000-8000-000000000010";
const OWNER = "news.friday-report";
const COLLEAGUE = "sales.researcher";
const CHIEF = "chief-of-staff";
const USER = "user-1";

let counter = 0;
const nextId = (prefix: string) => `${prefix}-${++counter}`;
const now = () => new Date("2026-09-18T10:00:00Z").toISOString();

/** In-memory stand-ins for the DAL stores the tools touch. */
function memoryStores() {
  const outcomes: RoutineOutcomeRow[] = [];
  const routines: RoutineRow[] = [];
  const triggers: RoutineTriggerRow[] = [];
  const workflows: WorkflowRow[] = [];
  const versions: WorkflowVersionRow[] = [];

  const routineStore: RoutineStore = {
    async create(input: CreateRoutineInput) {
      const row: RoutineRow = {
        agent_id: input.agentId,
        approval_grants: input.approvalGrants ?? [],
        created_at: now(),
        created_by_user_id: input.createdByUserId ?? null,
        declaration_id: input.declarationId ?? null,
        description: input.description ?? null,
        enabled: input.enabled ?? true,
        id: input.id ?? nextId("routine"),
        last_fired_at: null,
        last_result: null,
        module_id: input.moduleId ?? null,
        name: input.name,
        quiet_hours: input.quietHours ?? null,
        report: input.report ?? "desk_card",
        source: input.source ?? "custom",
        space_id: input.spaceId ?? null,
        tenant_id: input.tenantId,
        updated_at: now(),
        workflow_id: input.workflowId,
        workflow_input: input.workflowInput ?? {},
      };
      routines.push(row);
      return row;
    },
    async delete({ id }) {
      const index = routines.findIndex((row) => row.id === id);
      if (index >= 0) {
        routines.splice(index, 1);
      }
    },
    async get({ id }) {
      return routines.find((row) => row.id === id) ?? null;
    },
    async getByDeclaration() {
      return null;
    },
    async list(input) {
      return routines.filter(
        (row) =>
          (input.spaceId === undefined || row.space_id === input.spaceId) &&
          (input.agentId === undefined || row.agent_id === input.agentId)
      );
    },
    async listTenantIds() {
      return [TENANT];
    },
    async recordFire() {
      return;
    },
    async update(input: UpdateRoutineInput & { id: string; tenantId: string }) {
      const row = routines.find((entry) => entry.id === input.id);
      if (!row) {
        throw new Error("not found");
      }
      Object.assign(row, {
        ...(input.agentId === undefined ? {} : { agent_id: input.agentId }),
        ...(input.approvalGrants === undefined
          ? {}
          : { approval_grants: input.approvalGrants }),
        ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.report === undefined ? {} : { report: input.report }),
        ...(input.workflowId === undefined
          ? {}
          : { workflow_id: input.workflowId }),
      });
      return row;
    },
  };

  const triggerStore = {
    async create(input: CreateRoutineTriggerInput) {
      const row: RoutineTriggerRow = {
        created_at: now(),
        cron: input.cron ?? null,
        enabled: input.enabled ?? true,
        event_filter: input.eventFilter ?? null,
        id: nextId("trigger"),
        input_mapping: input.inputMapping ?? null,
        kind: input.kind,
        provider_id: input.providerId ?? null,
        resource: input.resource ?? null,
        routine_id: input.routineId,
        schedule_id: null,
        shortcode: input.shortcode ?? null,
        tenant_id: input.tenantId,
        timezone: input.timezone ?? null,
        updated_at: now(),
        webhook_secret: null,
      };
      triggers.push(row);
      return row;
    },
    async list(input: { routineId?: string; tenantId: string }) {
      return triggers.filter(
        (row) =>
          input.routineId === undefined || row.routine_id === input.routineId
      );
    },
    async update(input: { cron?: string; id: string; timezone?: string }) {
      const row = triggers.find((entry) => entry.id === input.id);
      if (!row) {
        throw new Error("not found");
      }
      Object.assign(row, {
        ...(input.cron === undefined ? {} : { cron: input.cron }),
        ...(input.timezone === undefined ? {} : { timezone: input.timezone }),
      });
      return row;
    },
  } as unknown as RoutineTriggerStore;

  const outcomeStore = {
    async create(input: CreateRoutineOutcomeInput) {
      const row: RoutineOutcomeRow = {
        config: input.config ?? {},
        created_at: now(),
        description: null,
        enabled: input.enabled ?? true,
        id: nextId("outcome"),
        mode: input.mode,
        provider_id: input.providerId,
        routine_id: input.routineId,
        tenant_id: input.tenantId,
        updated_at: now(),
      };
      outcomes.push(row);
      return row;
    },
    async delete({ id }: { id: string }) {
      const index = outcomes.findIndex((row) => row.id === id);
      if (index >= 0) {
        outcomes.splice(index, 1);
      }
    },
    async list(input: { routineId?: string; tenantId: string }) {
      return outcomes.filter(
        (row) =>
          input.routineId === undefined || row.routine_id === input.routineId
      );
    },
  } as unknown as RoutineOutcomeStore;

  const workflowStore = {
    async create(input: CreateWorkflowInput) {
      const row: WorkflowRow = {
        context_type: input.contextType ?? null,
        created_at: now(),
        created_by_user_id: input.createdByUserId ?? null,
        current_version: null,
        description: input.description ?? null,
        id: nextId("workflow"),
        module_id: null,
        name: input.name,
        owner_agent_id: input.ownerAgentId ?? null,
        source_workflow_id: null,
        status: "active",
        surface: "chat",
        tenant_id: input.tenantId,
        title: input.title ?? null,
        updated_at: now(),
      };
      workflows.push(row);
      return row;
    },
    async findBySourceWorkflow() {
      return null;
    },
    async getCurrent({ id }: { id: string }) {
      const graph = workflows.find((row) => row.id === id);
      if (!graph?.current_version) {
        return null;
      }
      const version = versions.find(
        (row) => row.workflow_id === id && row.version === graph.current_version
      );
      return version ? { graph, version } : null;
    },
    async getGraph({ id }: { id: string }) {
      return workflows.find((row) => row.id === id) ?? null;
    },
    async getVersion({ id }: { id: string }) {
      return versions.find((row) => row.id === id) ?? null;
    },
    async listVersions({ workflowId }: { workflowId: string }) {
      return versions.filter((row) => row.workflow_id === workflowId);
    },
    async publishVersion(input: {
      approvedByUserId?: string | null;
      versionId: string;
    }) {
      const version = versions.find((row) => row.id === input.versionId);
      if (!version) {
        throw new Error("workflow_version not found");
      }
      version.approved_at = now();
      version.approved_by_user_id = input.approvedByUserId ?? null;
      const graph = workflows.find((row) => row.id === version.workflow_id);
      if (!graph) {
        throw new Error("workflow not found");
      }
      graph.current_version = version.version;
      return { graph, version };
    },
    async saveVersion(input: SaveVersionInput) {
      const siblings = versions.filter(
        (row) => row.workflow_id === input.workflowId
      );
      const version: WorkflowVersionRow = {
        allowed_tools: input.allowedTools ?? null,
        approved_at: null,
        approved_by_user_id: null,
        authored_by: input.authoredBy ?? "user",
        created_at: now(),
        created_by_user_id: input.createdByUserId ?? null,
        graph: input.graph,
        id: nextId("version"),
        input_schema: input.inputSchema ?? {},
        output_schema: input.outputSchema ?? {},
        tenant_id: input.tenantId,
        version: siblings.length + 1,
        workflow_id: input.workflowId,
      };
      versions.push(version);
      return version;
    },
  } as unknown as WorkflowStore;

  return {
    outcomes,
    outcomeStore,
    routines,
    routineStore,
    triggerStore,
    triggers,
    versions,
    workflowStore,
    workflows,
  };
}

interface Harness {
  inbox: ReturnType<typeof vi.fn>;
  stores: ReturnType<typeof memoryStores>;
  tools: ReturnType<typeof createRoutineTools>;
}

function harness(
  input: { mode?: "manual" | "auto" | "pass-all" } = {}
): Harness {
  const stores = memoryStores();
  const inbox = vi.fn(async () => null);
  const deps: RoutineToolDeps = {
    approvalPolicy: () => ({
      loadSpaceMode: async () => null,
      loadTenantPrefs: async () => ({ mode: input.mode ?? "auto" }),
    }),
    inbox: inbox as unknown as RoutineToolDeps["inbox"],
    // Built-in providers only: no module registers a destination here.
    moduleLoader: { listModuleCapabilities: async () => [] },
    outcomes: () => stores.outcomeStore,
    resolveAgent: async (id) =>
      [OWNER, COLLEAGUE, CHIEF].includes(id)
        ? { id, kind: "specialist" as const }
        : null,
    resolveScope: async () => ({ capabilities: ["*"], userId: USER }),
    routines: () => stores.routineStore,
    threads: () => null,
    triggers: () => stores.triggerStore,
    workflows: () => stores.workflowStore,
  };
  return { inbox, stores, tools: createRoutineTools(deps) };
}

function spaceGate(topLevel: string[] = [CHIEF]) {
  return {
    agentIds: new Set([OWNER, COLLEAGUE, CHIEF]),
    allConnectorPrefixes: new Set<string>(),
    connectorPrefixes: new Set<string>(),
    moduleIds: new Set<string>(),
    readOnlyModuleIds: new Set<string>(),
    spaceId: SPACE,
    topLevelAgentIds: new Set(topLevel),
  };
}

function runAs(
  agentTypeKey: string,
  fn: () => Promise<unknown>,
  options: { interactive?: boolean } = {}
) {
  return engentyToolsRunAls.run(
    {
      accessToken: "token",
      agentTypeKey,
      canSuspendForInteraction: options.interactive ?? true,
      orchestratorThreadId: "thread-1",
      space: spaceGate(),
      tenantId: TENANT,
      userId: USER,
    },
    fn
  ) as Promise<Record<string, unknown>>;
}

const fridayReport = {
  cron: "0 8 * * 5",
  kind: "schedule" as const,
  name: "Friday report",
  prompt:
    "Write the weekly report from this week's tables into the report page.",
  report: "desk_card" as const,
  timezone: "Europe/Vienna",
};

function execute(
  h: Harness,
  tool: keyof ReturnType<typeof createRoutineTools>,
  input: Record<string, unknown>,
  context: Record<string, unknown> = {}
) {
  return h.tools[tool].execute?.(input as never, context as never) as Promise<
    Record<string, unknown>
  >;
}

afterEach(() => {
  resetFrontendToolSuspendSlotsForTests();
});

describe(ROUTINES_CREATE_TOOL_ID, () => {
  it("lets a specialist give itself a prompt routine in auto mode, bound to a published one-node Workflow", async () => {
    const h = harness({ mode: "auto" });
    const output = await runAs(OWNER, () =>
      execute(h, ROUTINES_CREATE_TOOL_ID, fridayReport)
    );
    expect(output.status).toBe("created");
    const routine = output.routine as Record<string, unknown>;
    expect(routine.agent_id).toBe(OWNER);
    expect(
      (routine.triggers as { kind: string; cron: string | null }[]).map((t) => [
        t.kind,
        t.cron,
      ])
    ).toEqual([
      ["schedule", "0 8 * * 5"],
      ["manual", null],
      ["agent", null],
    ]);
    const current = await h.stores.workflowStore.getCurrent({
      id: routine.workflow_id as string,
      tenantId: TENANT,
    });
    expect(current).not.toBeNull();
    expect(promptOfWorkflowGraph(current?.version.graph)).toBe(
      fridayReport.prompt
    );
    expect(current?.graph.owner_agent_id).toBe(OWNER);
    expect(h.inbox).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "routine_created",
        metadata: expect.objectContaining({ agent_id: OWNER }),
        spaceId: SPACE,
      })
    );
  });

  it("keeps a specialist's routines its own: naming a colleague is refused, not re-pointed", async () => {
    const h = harness({ mode: "auto" });
    const output = await runAs(OWNER, () =>
      execute(h, ROUTINES_CREATE_TOOL_ID, {
        ...fridayReport,
        agent_id: COLLEAGUE,
      })
    );
    expect(output.status).toBe("refused");
    expect(h.stores.routines).toHaveLength(0);
  });

  it("parks on one Approve card in manual mode and creates on the person's approve", async () => {
    const h = harness({ mode: "manual" });
    const suspend = vi.fn<(payload: unknown) => Promise<undefined>>(
      async () => undefined
    );
    const parked = await runAs(OWNER, () =>
      execute(h, ROUTINES_CREATE_TOOL_ID, fridayReport, {
        agent: { suspend },
      })
    );
    expect(parked).toBeUndefined();
    expect(suspend).toHaveBeenCalledTimes(1);
    expect(h.stores.routines).toHaveLength(0);

    const approved = await runAs(OWNER, () =>
      execute(h, ROUTINES_CREATE_TOOL_ID, fridayReport, {
        agent: { resumeData: { choice_id: "approve" } },
      })
    );
    expect(approved.status).toBe("created");
    // Published as the person who answered, not as the run.
    expect(h.stores.versions[0]?.approved_by_user_id).toBe(USER);
  });

  it("creates nothing when the person rejects the card", async () => {
    const h = harness({ mode: "manual" });
    const declined = await runAs(OWNER, () =>
      execute(h, ROUTINES_CREATE_TOOL_ID, fridayReport, {
        agent: { resumeData: { choice_id: "reject" } },
      })
    );
    expect(declined.status).toBe("declined");
    expect(h.stores.routines).toHaveLength(0);
    expect(h.stores.workflows).toHaveLength(0);
  });

  it("refuses in manual mode where nobody can answer", async () => {
    const h = harness({ mode: "manual" });
    const output = await runAs(
      OWNER,
      () => execute(h, ROUTINES_CREATE_TOOL_ID, fridayReport),
      { interactive: false }
    );
    expect(output.status).toBe("refused");
    expect(h.stores.routines).toHaveLength(0);
  });

  it("always asks for approval_grants, and when the model sets ask_first in auto", async () => {
    const h = harness({ mode: "pass-all" });
    const suspend = vi.fn<(payload: unknown) => Promise<undefined>>(
      async () => undefined
    );
    await runAs(OWNER, () =>
      execute(
        h,
        ROUTINES_CREATE_TOOL_ID,
        { ...fridayReport, approval_grants: ["contacts_update"] },
        { agent: { suspend } }
      )
    );
    expect(suspend).toHaveBeenCalledTimes(1);
    expect(
      (suspend.mock.calls[0]?.[0] as unknown as { body: string }).body
    ).toContain("contacts_update");

    const auto = harness({ mode: "auto" });
    const askFirst = vi.fn<(payload: unknown) => Promise<undefined>>(
      async () => undefined
    );
    await runAs(OWNER, () =>
      execute(
        auto,
        ROUTINES_CREATE_TOOL_ID,
        { ...fridayReport, ask_first: true },
        { agent: { suspend: askFirst } }
      )
    );
    expect(askFirst).toHaveBeenCalledTimes(1);
    expect(auto.stores.routines).toHaveLength(0);
  });

  it("publishes a draft Workflow as the run when the mode trusts the agent, and disables the routine when it cannot", async () => {
    const h = harness({ mode: "auto" });
    const draft = await h.stores.workflowStore.create({
      name: "weekly-digest",
      ownerAgentId: OWNER,
      tenantId: TENANT,
      title: "Weekly digest",
    });
    await h.stores.workflowStore.saveVersion({
      authoredBy: "copilot",
      graph: {
        graph: [
          {
            type: "mapping",
            id: "prep-wait",
            mapConfig: JSON.stringify({
              duration_ms: { value: 60_000 },
              reason: { value: "let it settle" },
            }),
          },
          { type: "tool", id: "wait", toolId: "wait_until" },
        ],
        id: `workflow:${draft.id}`,
      },
      tenantId: TENANT,
      workflowId: draft.id,
    });
    const { prompt: _prompt, ...body } = fridayReport;
    const output = await runAs(OWNER, () =>
      execute(h, ROUTINES_CREATE_TOOL_ID, { ...body, workflow_id: draft.id })
    );
    expect(output.status).toBe("created");
    expect((output.routine as { enabled: boolean }).enabled).toBe(true);
    expect(h.stores.versions[0]?.approved_by_user_id).toBe(USER);

    // A graph the run cannot validate stays a draft — the routine exists but
    // sleeps until a person publishes on the canvas.
    const broken = await h.stores.workflowStore.create({
      name: "broken",
      ownerAgentId: OWNER,
      tenantId: TENANT,
    });
    await h.stores.workflowStore.saveVersion({
      graph: {
        graph: [{ type: "tool", id: "x", toolId: "no_such_tool" }],
        id: `workflow:${broken.id}`,
      },
      tenantId: TENANT,
      workflowId: broken.id,
    });
    const asleep = await runAs(OWNER, () =>
      execute(h, ROUTINES_CREATE_TOOL_ID, {
        ...body,
        cron: "0 9 * * 1",
        name: "Monday digest",
        workflow_id: broken.id,
      })
    );
    expect(asleep.status).toBe("created");
    expect((asleep.routine as { enabled: boolean }).enabled).toBe(false);
  });

  it("refuses a second routine that wakes at the same time to run the same Workflow", async () => {
    // Same target = same Workflow + same owner. A prompt routine mints its
    // own Workflow, so the guard reads on Workflow-backed routines.
    const h = harness({ mode: "pass-all" });
    const { prompt: _prompt, ...body } = fridayReport;
    const first = await runAs(OWNER, () =>
      execute(h, ROUTINES_CREATE_TOOL_ID, fridayReport)
    );
    const workflowId = (first.routine as { workflow_id: string }).workflow_id;
    const again = await runAs(OWNER, () =>
      execute(h, ROUTINES_CREATE_TOOL_ID, {
        ...body,
        name: "Again",
        workflow_id: workflowId,
      })
    );
    expect(again.status).toBe("duplicate");
    expect(h.stores.routines).toHaveLength(1);
  });
});

describe(`${ROUTINES_CREATE_TOOL_ID} destinations`, () => {
  const notifyMe = [
    { mode: "always", provider_id: "notification.high" },
    {
      config: { to: "owner@example.com" },
      mode: "agent",
      provider_id: "email",
    },
  ];

  it("writes destinations beside the routine and reads them back", async () => {
    const h = harness({ mode: "pass-all" });
    const output = await runAs(OWNER, () =>
      execute(h, ROUTINES_CREATE_TOOL_ID, {
        ...fridayReport,
        outcomes: notifyMe,
      })
    );
    expect(output.status).toBe("created");
    const routine = output.routine as {
      outcomes: { mode: string; provider_id: string }[];
      routine_id: string;
    };
    expect(routine.outcomes.map((row) => [row.provider_id, row.mode])).toEqual([
      ["notification.high", "always"],
      ["email", "agent"],
    ]);
    expect(
      h.stores.outcomes.every((row) => row.routine_id === routine.routine_id)
    ).toBe(true);
    expect(h.stores.outcomes[1]?.config).toEqual({ to: "owner@example.com" });
  });

  it("refuses an unknown provider or a config that does not fit", async () => {
    const h = harness({ mode: "pass-all" });
    const unknown = await runAs(OWNER, () =>
      execute(h, ROUTINES_CREATE_TOOL_ID, {
        ...fridayReport,
        outcomes: [{ mode: "always", provider_id: "bell" }],
      })
    );
    expect(unknown.status).toBe("refused");
    const noRecipient = await runAs(OWNER, () =>
      execute(h, ROUTINES_CREATE_TOOL_ID, {
        ...fridayReport,
        outcomes: [{ mode: "always", provider_id: "email" }],
      })
    );
    expect(noRecipient.status).toBe("refused");
    expect(h.stores.routines).toHaveLength(0);
    expect(h.stores.outcomes).toHaveLength(0);
  });
});

describe(ROUTINES_LIST_TOOL_ID, () => {
  it("shows a specialist its own routines and a coordinator the Space's", async () => {
    const h = harness({ mode: "pass-all" });
    await runAs(OWNER, () => execute(h, ROUTINES_CREATE_TOOL_ID, fridayReport));
    await runAs(CHIEF, () =>
      execute(h, ROUTINES_CREATE_TOOL_ID, {
        ...fridayReport,
        agent_id: COLLEAGUE,
        cron: "0 7 * * 1",
        name: "Monday prospects",
      })
    );
    const own = await runAs(OWNER, () => execute(h, ROUTINES_LIST_TOOL_ID, {}));
    expect(
      (own.routines as { agent_id: string }[]).map((r) => r.agent_id)
    ).toEqual([OWNER]);
    const all = await runAs(CHIEF, () => execute(h, ROUTINES_LIST_TOOL_ID, {}));
    expect(
      (all.routines as { agent_id: string }[]).map((r) => r.agent_id).sort()
    ).toEqual([OWNER, COLLEAGUE].sort());
  });
});

describe(ROUTINES_UPDATE_TOOL_ID, () => {
  it("lets a specialist re-brief its own prompt routine but not hand it over", async () => {
    const h = harness({ mode: "pass-all" });
    const created = await runAs(OWNER, () =>
      execute(h, ROUTINES_CREATE_TOOL_ID, fridayReport)
    );
    const routineId = (created.routine as { routine_id: string }).routine_id;
    const rebriefed = await runAs(OWNER, () =>
      execute(h, ROUTINES_UPDATE_TOOL_ID, {
        prompt: "Write the report, then post its link on the desk.",
        routine_id: routineId,
      })
    );
    expect(rebriefed.status).toBe("updated");

    const handover = await runAs(OWNER, () =>
      execute(h, ROUTINES_UPDATE_TOOL_ID, {
        agent_id: COLLEAGUE,
        routine_id: routineId,
      })
    );
    expect(handover.status).toBe("refused");

    const theirs = await runAs(COLLEAGUE, () =>
      execute(h, ROUTINES_UPDATE_TOOL_ID, {
        enabled: false,
        routine_id: routineId,
      })
    );
    expect(theirs.status).toBe("refused");
  });

  it("pauses on a card before new grants land on a routine", async () => {
    const h = harness({ mode: "pass-all" });
    const created = await runAs(OWNER, () =>
      execute(h, ROUTINES_CREATE_TOOL_ID, fridayReport)
    );
    const routineId = (created.routine as { routine_id: string }).routine_id;
    const suspend = vi.fn<(payload: unknown) => Promise<undefined>>(
      async () => undefined
    );
    const parked = await runAs(OWNER, () =>
      execute(
        h,
        ROUTINES_UPDATE_TOOL_ID,
        { approval_grants: ["contacts_update"], routine_id: routineId },
        { agent: { suspend } }
      )
    );
    expect(parked).toBeUndefined();
    expect(suspend).toHaveBeenCalledTimes(1);
    expect(h.stores.routines[0]?.approval_grants).toEqual([]);

    const approved = await runAs(OWNER, () =>
      execute(
        h,
        ROUTINES_UPDATE_TOOL_ID,
        { approval_grants: ["contacts_update"], routine_id: routineId },
        { agent: { resumeData: { choice_id: "approve" } } }
      )
    );
    expect(approved.status).toBe("updated");
    expect(h.stores.routines[0]?.approval_grants).toEqual(["contacts_update"]);
  });

  it("replaces the destinations when outcomes is present, and [] clears them", async () => {
    const h = harness({ mode: "pass-all" });
    const created = await runAs(OWNER, () =>
      execute(h, ROUTINES_CREATE_TOOL_ID, {
        ...fridayReport,
        outcomes: [{ mode: "always", provider_id: "notification.update" }],
      })
    );
    const routineId = (created.routine as { routine_id: string }).routine_id;

    const renamed = await runAs(OWNER, () =>
      execute(h, ROUTINES_UPDATE_TOOL_ID, {
        name: "Friday digest",
        routine_id: routineId,
      })
    );
    expect(
      (renamed.routine as { outcomes: { provider_id: string }[] }).outcomes.map(
        (row) => row.provider_id
      )
    ).toEqual(["notification.update"]);

    const louder = await runAs(OWNER, () =>
      execute(h, ROUTINES_UPDATE_TOOL_ID, {
        outcomes: [{ mode: "always", provider_id: "notification.high" }],
        routine_id: routineId,
      })
    );
    expect(louder.status).toBe("updated");
    expect(h.stores.outcomes.map((row) => row.provider_id)).toEqual([
      "notification.high",
    ]);

    const refusedUpdate = await runAs(OWNER, () =>
      execute(h, ROUTINES_UPDATE_TOOL_ID, {
        outcomes: [{ mode: "always", provider_id: "webhook" }],
        routine_id: routineId,
      })
    );
    expect(refusedUpdate.status).toBe("refused");
    expect(h.stores.outcomes.map((row) => row.provider_id)).toEqual([
      "notification.high",
    ]);

    const cleared = await runAs(OWNER, () =>
      execute(h, ROUTINES_UPDATE_TOOL_ID, {
        outcomes: [],
        routine_id: routineId,
      })
    );
    expect((cleared.routine as { outcomes: unknown[] }).outcomes).toEqual([]);
    expect(h.stores.outcomes).toHaveLength(0);
  });

  it("asks for a new external destination only where the Space's mode asks", async () => {
    const policy: { mode: "manual" | "auto" } = { mode: "auto" };
    const h = harness(policy);
    const created = await runAs(OWNER, () =>
      execute(h, ROUTINES_CREATE_TOOL_ID, {
        ...fridayReport,
        outcomes: [{ mode: "always", provider_id: "notification.update" }],
      })
    );
    const routineId = (created.routine as { routine_id: string }).routine_id;
    const email = {
      config: { to: "me@example.com" },
      mode: "always",
      provider_id: "email",
    };
    const providers = () => h.stores.outcomes.map((row) => row.provider_id);

    policy.mode = "manual";
    const suspend = vi.fn(async () => undefined);
    const parked = await runAs(OWNER, () =>
      execute(
        h,
        ROUTINES_UPDATE_TOOL_ID,
        { outcomes: [email], routine_id: routineId },
        { agent: { suspend } }
      )
    );
    expect(parked).toBeUndefined();
    expect(suspend).toHaveBeenCalledTimes(1);
    expect(providers()).toEqual(["notification.update"]);

    const approved = await runAs(OWNER, () =>
      execute(
        h,
        ROUTINES_UPDATE_TOOL_ID,
        { outcomes: [email], routine_id: routineId },
        { agent: { resumeData: { choice_id: "approve" } } }
      )
    );
    expect(approved.status).toBe("updated");
    expect(providers()).toEqual(["email"]);

    const nobodyToAsk = await runAs(
      OWNER,
      () =>
        execute(h, ROUTINES_UPDATE_TOOL_ID, {
          outcomes: [{ ...email, config: { to: "other@example.com" } }],
          routine_id: routineId,
        }),
      { interactive: false }
    );
    expect(nobodyToAsk.status).toBe("refused");
    expect(providers()).toEqual(["email"]);

    policy.mode = "auto";
    const auto = await runAs(OWNER, () =>
      execute(
        h,
        ROUTINES_UPDATE_TOOL_ID,
        {
          outcomes: [{ ...email, config: { to: "other@example.com" } }],
          routine_id: routineId,
        },
        { agent: { suspend } }
      )
    );
    expect(auto.status).toBe("updated");
    expect(suspend).toHaveBeenCalledTimes(1);
  });
});
