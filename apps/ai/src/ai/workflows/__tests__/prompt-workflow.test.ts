import { describe, expect, it, vi } from "vitest";
import {
  ARTIFACT_WRITE_PRIMITIVE_ID,
  RUN_SPECIALIST_PRIMITIVE_ID,
} from "../primitive-ids.js";
import {
  isPromptWorkflowGraph,
  materializePromptWorkflow,
  PromptWorkflowInvalidError,
  promptOfWorkflowGraph,
  promptWorkflowDefinition,
} from "../prompt-workflow.js";

describe("prompt workflow", () => {
  it("runs the specialist on the prompt, then stores its result on the Space", () => {
    const def = promptWorkflowDefinition({
      agentId: "chief-of-staff",
      prompt: "  Check the inbox and summarize what needs me.  ",
    });
    const [prepare, run, prepareStore, store] = def.graph as Record<
      string,
      unknown
    >[];
    expect(def.graph).toHaveLength(4);
    const mapConfig = JSON.parse(prepare?.mapConfig as string) as Record<
      string,
      { value?: unknown }
    >;
    expect(mapConfig.brief).toEqual({
      value: "Check the inbox and summarize what needs me.",
    });
    expect(mapConfig.agent_type_key).toEqual({ value: "chief-of-staff" });
    expect(mapConfig.output_schema?.value).toMatchObject({
      required: ["title", "summary", "document"],
    });
    expect(run).toMatchObject({
      toolId: RUN_SPECIALIST_PRIMITIVE_ID,
      type: "tool",
    });
    // Storing never depends on the model: the store step takes the
    // specialist's answer field by field.
    const storeConfig = JSON.parse(prepareStore?.mapConfig as string);
    expect(storeConfig).toMatchObject({
      content: { path: "output.document", step: run?.id },
      store_to: { value: { scope_type: "space" } },
      summary: { path: "output.summary", step: run?.id },
      title: { path: "output.title", step: run?.id },
      type: { value: "markdown" },
      // A rerun with the same title (same day, same week) is the same page.
      update_same_title: { value: true },
    });
    expect(store).toMatchObject({
      toolId: ARTIFACT_WRITE_PRIMITIVE_ID,
      type: "tool",
    });
    expect(promptOfWorkflowGraph(def as never)).toBe(
      "Check the inbox and summarize what needs me."
    );
    expect(isPromptWorkflowGraph(def as never)).toBe(true);
  });

  it("stores a report as HTML and leaves a data routine's rows to the specialist", () => {
    const report = promptWorkflowDefinition({
      agentId: "a",
      prompt: "Weekly numbers",
      result: "report",
    });
    const storeConfig = JSON.parse(
      (report.graph as Record<string, unknown>[])[2]?.mapConfig as string
    );
    expect(storeConfig.type).toEqual({ value: "html" });

    const data = promptWorkflowDefinition({
      agentId: "a",
      prompt: "Add today's prices",
      result: "data",
    });
    expect(
      (data.graph as Record<string, unknown>[]).some(
        (entry) => entry.toolId === ARTIFACT_WRITE_PRIMITIVE_ID
      )
    ).toBe(false);
  });

  it("reads null off a canvas workflow", () => {
    expect(promptOfWorkflowGraph({ graph: [], id: "x" })).toBeNull();
    expect(isPromptWorkflowGraph({ graph: [], id: "x" })).toBe(false);
    expect(promptOfWorkflowGraph(null)).toBeNull();
  });

  function storeHarness(current: { graph: Record<string, unknown> } | null) {
    const create = vi.fn(async (input: { name: string }) => ({
      id: "wf-new",
      name: input.name,
    }));
    const saveVersion = vi.fn(async (input: { workflowId: string }) => ({
      id: `v-${input.workflowId}`,
      workflow_id: input.workflowId,
    }));
    const publishVersion = vi.fn(async () => ({}));
    const getCurrent = vi.fn(async () =>
      current ? { graph: {}, version: { graph: current.graph } } : null
    );
    return {
      create,
      getCurrent,
      publishVersion,
      saveVersion,
      store: { create, getCurrent, publishVersion, saveVersion } as never,
    };
  }

  it("mints, versions and publishes a workflow as the caller", async () => {
    const h = storeHarness(null);
    const result = await materializePromptWorkflow({
      agentId: "chief-of-staff",
      prompt: "Do the thing",
      routineName: "Morgen-Briefing",
      store: h.store,
      tenantId: "t1",
      userId: "u1",
      validate: () => [],
    });
    expect(result.workflowId).toBe("wf-new");
    expect(h.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: expect.stringMatching(/^morgen-briefing-[0-9a-f]{8}$/),
        ownerAgentId: "chief-of-staff",
        tenantId: "t1",
        title: "Morgen-Briefing",
      })
    );
    expect(h.saveVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        authoredBy: "user",
        createdByUserId: "u1",
        workflowId: "wf-new",
      })
    );
    expect(h.publishVersion).toHaveBeenCalledWith({
      approvedByUserId: "u1",
      tenantId: "t1",
      versionId: "v-wf-new",
    });
  });

  it("re-briefs a prompt workflow in place, but never a canvas one", async () => {
    const promptGraph = promptWorkflowDefinition({
      agentId: "a",
      prompt: "old",
    });
    const own = storeHarness({ graph: promptGraph as never });
    await materializePromptWorkflow({
      agentId: "a",
      prompt: "new",
      routineName: "R",
      store: own.store,
      tenantId: "t1",
      userId: "u1",
      validate: () => [],
      workflowId: "wf-1",
    });
    expect(own.create).not.toHaveBeenCalled();
    expect(own.saveVersion).toHaveBeenCalledWith(
      expect.objectContaining({ workflowId: "wf-1" })
    );

    const canvas = storeHarness({ graph: { graph: [], id: "canvas" } });
    const result = await materializePromptWorkflow({
      agentId: "a",
      prompt: "new",
      routineName: "R",
      store: canvas.store,
      tenantId: "t1",
      userId: "u1",
      validate: () => [],
      workflowId: "wf-canvas",
    });
    expect(canvas.create).toHaveBeenCalled();
    expect(result.workflowId).toBe("wf-new");
  });

  it("refuses an invalid definition before writing anything", async () => {
    const h = storeHarness(null);
    await expect(
      materializePromptWorkflow({
        agentId: "a",
        prompt: "x",
        routineName: "R",
        store: h.store,
        tenantId: "t1",
        userId: "u1",
        validate: () => [{ message: "nope" }],
      })
    ).rejects.toBeInstanceOf(PromptWorkflowInvalidError);
    expect(h.create).not.toHaveBeenCalled();
  });
});
