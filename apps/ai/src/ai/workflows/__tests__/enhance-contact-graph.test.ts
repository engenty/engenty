// The shipped `contacts.enhance-contact` graph, run end to end.
//
// It is the first module Workflow that is more than one agent step, so it is
// also the first that can be wrong in a way validation cannot see: the entries
// are wired to each other by mapping PATHS, and a path that misses resolves to
// undefined (or throws) only once a run reaches it. Both gate outcomes are
// exercised because they take different paths out of the same node — approve
// carries the patch, reject carries nothing, and `patch` must survive that.
//
// Everything except the specialist is the real primitive. The specialist is
// stubbed because it is the one node that calls a model; its OUTPUT shape is
// what the rest of the graph is wired to, so the stub returns exactly what
// `output_schema` promises.
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadModuleWorkflowsFromDirectory } from "@engenty/ai-core";
import { Mastra } from "@mastra/core";
import type { RequestContext } from "@mastra/core/request-context";
import { createTool } from "@mastra/core/tools";
import { rehydrateWorkflow } from "@mastra/core/workflows";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const invoke =
  vi.fn<(op: string, input?: Record<string, unknown>) => unknown>();

vi.mock("../../sessions/task-workspace-hook.js", () => ({
  createScopeModuleOperationInvoker: () => invoke,
}));
vi.mock("../../jobs/task-job-scope.js", () => ({
  resolveTaskJobServiceScope: async (tenantId: string) => ({
    tenantId,
    userId: "service-user",
  }),
}));

const CONTACT_ID = "contact-77";

/** What `contacts_get` hands the specialist. */
const STORED_CONTACT = {
  id: CONTACT_ID,
  name: "Acme GmbH",
  address_info: null,
  vat_id: null,
};

/** What the specialist proposes — the shape `output_schema` requires. */
const RESEARCHED = {
  updates: { address_info: "Stiege 2", vat_id: "ATU12345678" },
  evidence_summary: "Imprint + EU VIES; both agree.",
};

const specialistCalls: Record<string, unknown>[] = [];

/** Stands in for the one node that calls a model. */
function createRunSpecialistStub() {
  return createTool({
    id: "run_specialist",
    description: "test stub",
    inputSchema: z.object({
      agent_type_key: z.string(),
      brief: z.string(),
      input: z.record(z.string(), z.unknown()).default({}),
      output_schema: z.record(z.string(), z.unknown()).optional(),
      allowed_tools: z.array(z.string()).optional(),
      thread_mode: z.enum(["reuse", "new"]).default("new"),
    }),
    outputSchema: z.object({
      output: z.unknown(),
      run_id: z.string(),
      thread_id: z.string(),
    }),
    execute: (input) => {
      specialistCalls.push(input as Record<string, unknown>);
      return Promise.resolve({
        output: RESEARCHED,
        run_id: "stub-run",
        thread_id: "stub-thread",
      });
    },
  });
}

const runCtx = {
  workflowId: "contacts.enhance-contact",
  workflowVersion: 1,
  contextId: CONTACT_ID,
  contextType: "contacts.person",
  requestId: randomUUID(),
  // Tenant-global: the graph does not narrow to a Space, and `null` is what a
  // run outside one carries.
  space: null,
  tenantId: randomUUID(),
  threadId: randomUUID(),
  allowedToolIds: ["contacts_get", "web_search"],
};

describe("contacts.enhance-contact", () => {
  let definition: Record<string, unknown>;
  let workflow: Awaited<ReturnType<typeof rehydrateWorkflow>>["workflow"];
  let requestContext: RequestContext;

  beforeAll(async () => {
    const workflowsDir = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../../../../modules/contacts/ai/workflows"
    );
    const loaded = loadModuleWorkflowsFromDirectory({
      moduleId: "contacts",
      workflowsDir,
    });
    const enhance = loaded.find(
      (entry) => entry.id === "contacts.enhance-contact"
    );
    expect(enhance).toBeTruthy();
    definition = enhance?.definition as unknown as Record<string, unknown>;

    const { createGraphActionPrimitives } = await import(
      "../primitives/index.js"
    );
    const mastra = new Mastra({
      tools: {
        ...createGraphActionPrimitives(),
        run_specialist: createRunSpecialistStub(),
      },
    });
    const rehydrated = await rehydrateWorkflow(definition as never, mastra);
    workflow = rehydrated.workflow;
    mastra.addWorkflow(workflow);

    const { buildGraphRequestContext } = await import("../dispatch.js");
    requestContext = buildGraphRequestContext(runCtx as never);
  });

  beforeEach(() => {
    invoke.mockReset();
    invoke.mockImplementation((op) =>
      op === "contacts_get" ? STORED_CONTACT : { ok: true }
    );
    specialistCalls.length = 0;
  });

  it("validates as shipped", async () => {
    const { validateGraphAction } = await import("../validate-graph.js");
    expect(validateGraphAction(definition as never)).toEqual([]);
  });

  it("reads the contact, briefs the specialist with it, and gates before writing", async () => {
    const run = await workflow.createRun({ runId: randomUUID() });
    const result = await run.start({
      inputData: { id: CONTACT_ID },
      requestContext,
    });

    // The read is a node now, not an instruction — the id comes off the run's
    // own input, so it cannot be skipped or misremembered.
    expect(invoke).toHaveBeenCalledWith("contacts_get", { id: CONTACT_ID });

    // The specialist is handed the record instead of fetching it, and is
    // narrowed to the one tool research actually needs.
    expect(specialistCalls).toHaveLength(1);
    expect(specialistCalls[0]?.input).toEqual(STORED_CONTACT);
    expect(specialistCalls[0]?.agent_type_key).toBe("contacts.manager");
    expect(specialistCalls[0]?.allowed_tools).toEqual(["web_search"]);
    expect(specialistCalls[0]?.output_schema).toBeTruthy();

    // Nothing is written before the human sees it.
    expect(invoke).not.toHaveBeenCalledWith(
      "contacts_update",
      expect.anything()
    );
    expect(result.status).toBe("suspended");

    // The card renders `payload` as a flat field table, so the payload must be
    // the patch itself — evidence rides in the title instead.
    const gate = result.steps?.review;
    expect(gate?.suspendPayload?.kind).toBe("field_updates");
    expect(gate?.suspendPayload?.payload).toEqual(RESEARCHED.updates);
    expect(gate?.suspendPayload?.title).toContain(RESEARCHED.evidence_summary);
  });

  it("writes the approved patch to the run's subject", async () => {
    const run = await workflow.createRun({ runId: randomUUID() });
    await run.start({ inputData: { id: CONTACT_ID }, requestContext });

    // The approval card resumes with the payload it displayed.
    const resumed = await run.resume({
      step: "review",
      resumeData: { approved: true, data: RESEARCHED.updates },
      requestContext,
    });

    expect(resumed.status).toBe("success");
    expect(invoke).toHaveBeenCalledWith("contacts_update", {
      id: CONTACT_ID,
      patch: RESEARCHED.updates,
    });
    expect(resumed.result).toEqual({
      applied: 2,
      context_id: CONTACT_ID,
      context_type: "contacts.person",
    });
  });

  it("writes nothing when the human rejects, and still finishes", async () => {
    const run = await workflow.createRun({ runId: randomUUID() });
    await run.start({ inputData: { id: CONTACT_ID }, requestContext });

    // A rejection carries no `data`. `patch` is mapped one segment deep for
    // exactly this reason: a deeper path would throw here instead of resolving
    // to the empty patch that makes the write a no-op.
    const resumed = await run.resume({
      step: "review",
      resumeData: { approved: false, reason: "sources look stale" },
      requestContext,
    });

    expect(resumed.status).toBe("success");
    expect(resumed.result).toEqual({
      applied: 0,
      context_id: CONTACT_ID,
      context_type: "contacts.person",
    });
    expect(invoke).not.toHaveBeenCalledWith(
      "contacts_update",
      expect.anything()
    );
  });
});
