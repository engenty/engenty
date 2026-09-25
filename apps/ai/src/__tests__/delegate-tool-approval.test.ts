import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type EngentyToolsRunContext,
  engentyToolsRunAls,
} from "../../ai/tools/engenty-tools/lib/run-context.js";

const runDelegatedConversation = vi.fn();

vi.mock("../ai/conversation/delegate-run.js", () => ({
  runDelegatedConversation: (input: unknown) => runDelegatedConversation(input),
}));

vi.mock("../ai/conversation/child-space.js", () => ({
  inheritChildSpace: () => null,
}));

const { runDelegatedSpecialist } = await import(
  "../ai/conversation/delegate-tool.js"
);

function deps() {
  return {
    onProgress: vi.fn(),
    parentThreadId: "parent-thread",
    registry: {} as never,
    resolveChildWorkspace: vi.fn(async () => undefined),
    scope: { tenantId: "tenant", userId: "user" } as never,
    store: {
      createThread: vi.fn(async () => undefined),
    } as never,
  };
}

/** A child whose gate reports two misses, then answers. */
function gatedChild(finalText = "I need approval for kb_create.") {
  runDelegatedConversation.mockImplementation(
    async (input: {
      onApprovalRequired?: EngentyToolsRunContext["onApprovalRequired"];
    }) => {
      input.onApprovalRequired?.({
        operationId: "kb_create",
        riskLevel: "medium",
        title: "Create knowledge base",
      });
      input.onApprovalRequired?.({
        operationId: "kb_source_create",
        riskLevel: "high",
      });
      return { finalText };
    }
  );
}

const interactiveParent: EngentyToolsRunContext = {
  approvalGrants: [],
  approvalPolicy: "suspend",
  canSuspendForInteraction: true,
};

describe("runDelegatedSpecialist — child approval on the parent run", () => {
  beforeEach(() => {
    runDelegatedConversation.mockReset();
  });

  it("suspends the parent once with every operation the child was denied", async () => {
    gatedChild();
    const suspend = vi.fn(async (_payload: unknown) => undefined);
    await engentyToolsRunAls.run(interactiveParent, () =>
      runDelegatedSpecialist(deps(), {
        agentId: "knowledge-base.manager",
        alias: "Knowledge Base Manager",
        brief: "Create the KB.",
        context: { agent: { suspend } },
        toolCallId: "call-1",
        toolName: "message_agent",
      })
    );
    expect(suspend).toHaveBeenCalledTimes(1);
    expect(suspend.mock.calls[0]?.[0]).toMatchObject({
      kind: "tool_approval",
      operation_ids: ["kb_create", "kb_source_create"],
      risk_level: "high",
    });
  });

  it("re-dispatches the child after approval and returns its result", async () => {
    runDelegatedConversation.mockResolvedValue({ finalText: "Created." });
    const suspend = vi.fn(async () => undefined);
    const result = await engentyToolsRunAls.run(
      { ...interactiveParent, approvalGrants: ["kb_create"] },
      () =>
        runDelegatedSpecialist(deps(), {
          agentId: "knowledge-base.manager",
          alias: "Knowledge Base Manager",
          brief: "Create the KB.",
          context: {
            agent: {
              resumeData: { approved: true, choice_id: "approve_once" },
              suspend,
            },
          },
          toolCallId: "call-1",
          toolName: "message_agent",
        })
    );
    expect(suspend).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: true, result: "Created." });
  });

  it("does not raise the card twice when core still gates after approval", async () => {
    gatedChild("Still gated.");
    const suspend = vi.fn(async () => undefined);
    const result = await engentyToolsRunAls.run(interactiveParent, () =>
      runDelegatedSpecialist(deps(), {
        agentId: "knowledge-base.manager",
        alias: "Knowledge Base Manager",
        brief: "Create the KB.",
        context: {
          agent: { resumeData: { approved: true }, suspend },
        },
        toolCallId: "call-1",
        toolName: "message_agent",
      })
    );
    expect(suspend).not.toHaveBeenCalled();
    expect(result).toMatchObject({ error: "approval_required", ok: false });
  });

  it("ends on a denial without dispatching the child again", async () => {
    const result = await engentyToolsRunAls.run(interactiveParent, () =>
      runDelegatedSpecialist(deps(), {
        agentId: "knowledge-base.manager",
        alias: "Knowledge Base Manager",
        brief: "Create the KB.",
        context: { agent: { resumeData: { approved: false } } },
        toolCallId: "call-1",
        toolName: "message_agent",
      })
    );
    expect(runDelegatedConversation).not.toHaveBeenCalled();
    expect(result).toMatchObject({ error: "approval_denied", ok: false });
  });

  it("refuses an identical brief after a completed delivery in the same run", async () => {
    runDelegatedConversation.mockResolvedValue({ finalText: "Created." });
    const shared = { ...deps(), completedDelegations: new Map() };
    const call = () =>
      engentyToolsRunAls.run(interactiveParent, () =>
        runDelegatedSpecialist(shared, {
          agentId: "knowledge-base.manager",
          alias: "Knowledge Base Manager",
          brief: "Create the KB.",
          context: { agent: { suspend: vi.fn() } },
          toolCallId: "call-1",
          toolName: "message_agent",
        })
      );
    const first = await call();
    const second = await call();
    expect(runDelegatedConversation).toHaveBeenCalledTimes(1);
    expect(second).toMatchObject({
      duplicate_of_previous_call: true,
      ok: true,
      result: first.result,
    });
  });
});
