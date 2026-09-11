import { describe, expect, it, vi } from "vitest";

const { pressWorkflow } = vi.hoisted(() => ({
  pressWorkflow: vi.fn(async () => ({
    deduped: false,
    requestId: "req-1",
    runId: "run-1",
    threadId: "thread-1",
  })),
}));

vi.mock("../../ai/module-workflows.js", () => ({
  resolveWorkflowById: vi.fn(async () => ({
    definition: {
      graph: [{ id: "run", toolId: "run_specialist", type: "tool" }],
      id: "contacts-research",
      inputSchema: { type: "object" },
      outputSchema: {},
    },
    description: "Research a contact",
    id: "contacts-research",
    module_id: "contacts",
    name: "Research contact",
  })),
}));
vi.mock("../workflow-press.js", () => ({ pressWorkflow }));

import { invokeChatAction } from "../chat-action-invocation.js";

describe("chat action invocation", () => {
  it("presses through the shared dispatcher — a run, not a task", async () => {
    const result = await invokeChatAction({
      argsText: "",
      command: {
        workflow_id: "contacts-research",
        args: [
          {
            name: "contact",
            ref_entity: "contacts:contact",
            required: true,
            type: "ref",
          },
        ],
        command: "research-contact",
        id: "contacts.research-contact",
        kind: "workflow",
        module_id: "contacts",
      },
      idempotencyKey: "slash:message-1:contacts.research-contact",
      mastra: {} as never,
      refs: [
        {
          entity: "contacts:contact",
          label: "Acme",
          ref: "contacts:contact:contact-1",
        },
      ],
      scope: {
        tenantId: "tenant-1",
        userId: "user-1",
      },
      spaceId: "space-1",
    });

    expect(pressWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        context: {
          contextId: "contact-1",
          contextType: "contacts:contact",
        },
        idempotencyKey: "slash:message-1:contacts.research-contact",
        input: { contact: "contact-1" },
        spaceId: "space-1",
        // A slash command is a press with a different caller label.
        trigger: "command",
      })
    );
    expect(result).toEqual({ deduped: false, runId: "run-1" });
  });
});
