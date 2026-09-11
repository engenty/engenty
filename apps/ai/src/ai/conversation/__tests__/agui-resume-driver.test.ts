// The snapshot resume lane on `@ag-ui/mastra`.
//
// The lane's contract is narrow and every part of it has a live failure behind it:
// resume the SUSPENDED run (not the POST's), surface a second park instead of
// reporting success, never report an in-band failure as a finish, and do not frame
// a run the caller already framed.
import { EventType } from "@engenty/ag-ui-bridge";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resumeViaMastraAgent } from "../agui-resume-driver.js";
import { AgUiTurnAccumulator } from "../agui-turn-accumulator.js";

const resumeStream = vi.fn();
const getMemory = vi.fn(async () => undefined as unknown);

/**
 * `MastraAgent` takes the LOCAL agent path only when `"getMemory" in agent`, so the
 * probe has to carry it — without it the whole test would silently exercise the
 * remote client-js branch instead.
 */
function fakeAgent() {
  return { getMemory, model: { modelId: "m", provider: "p" }, resumeStream };
}

function streamOf(chunks: unknown[]) {
  return {
    fullStream: (async function* () {
      for (const chunk of chunks) {
        yield chunk;
      }
    })(),
  };
}

async function drive(overrides: Record<string, unknown> = {}) {
  const accumulator = new AgUiTurnAccumulator();
  const emitted: Record<string, unknown>[] = [];
  const outcome = await resumeViaMastraAgent({
    accumulator,
    agent: fakeAgent(),
    agentId: "engenty.copilot",
    emit: (e) => emitted.push(e as never as Record<string, unknown>),
    newRunId: "new-run-1",
    resourceId: "resource-1",
    resumeData: { approved: true },
    suspendedRunId: "run-suspended-1",
    threadId: "thread-1",
    toolCallId: "call-1",
    ...overrides,
  });
  return { accumulator, emitted, outcome };
}

const typesOf = (events: Record<string, unknown>[]) =>
  events.map((e) => String(e.type));

beforeEach(() => {
  vi.clearAllMocks();
  getMemory.mockResolvedValue(undefined);
});

describe("I2: the snapshot resume driver", () => {
  it("resumes the SUSPENDED run, not the POST's run", async () => {
    // The correlation that makes the whole lane work. `newRunId` is the run the
    // client attached to; the snapshot belongs to the run that parked. Getting
    // these the wrong way round resumes nothing and strands the interrupt.
    resumeStream.mockResolvedValue(
      streamOf([
        { payload: { id: "t1" }, type: "text-start" },
        { payload: { id: "t1", text: "ok" }, type: "text-delta" },
        { payload: { id: "t1" }, type: "text-end" },
      ])
    );

    await drive();

    expect(resumeStream).toHaveBeenCalledWith(
      { approved: true },
      expect.objectContaining({
        runId: "run-suspended-1",
        toolCallId: "call-1",
      })
    );
  });

  it("streams the continuation to the caller", async () => {
    resumeStream.mockResolvedValue(
      streamOf([
        { payload: { id: "t1" }, type: "text-start" },
        { payload: { id: "t1", text: "recovered" }, type: "text-delta" },
        { payload: { id: "t1" }, type: "text-end" },
      ])
    );

    const { accumulator, emitted } = await drive();

    expect(
      emitted.some((e) => String(e.delta ?? "").includes("recovered"))
    ).toBe(true);
    // ...and it lands in the durable transcript, which is what the NEXT turn reads.
    expect(accumulator.getTranscriptParts()).toEqual([
      { text: "recovered", type: "text" },
    ]);
  });

  it("does NOT frame a run the caller already framed", async () => {
    // `resume-conversation-run` brackets the resume with its own pair carrying
    // `newRunId`. Letting MastraAgent's through as well writes the frame twice
    // into ai.agent_run_event — a spec-compliant client rejects the second
    // RUN_STARTED outright.
    resumeStream.mockResolvedValue(
      streamOf([{ payload: { id: "t1", text: "ok" }, type: "text-delta" }])
    );

    const { accumulator, emitted } = await drive();

    expect(typesOf(emitted)).not.toContain(EventType.RUN_STARTED);
    expect(typesOf(emitted)).not.toContain(EventType.RUN_FINISHED);
    // But the accumulator still SEES the terminal event — it reads usage and the
    // interrupt outcome off it, so filtering the wire must not filter the sink.
    expect(accumulator.runUsage === null).toBe(true);
  });

  it("withholds Mastra's working-memory STATE_SNAPSHOT", async () => {
    // Our client stores STATE_SNAPSHOT as the app-shell UI
    // snapshot, so Mastra working memory arriving on that channel would clobber
    // the very state we deliberately moved OFF RunAgentInput.state.
    getMemory.mockResolvedValue({
      getWorkingMemory: async () => JSON.stringify({ notes: "remembered" }),
    });
    resumeStream.mockResolvedValue(
      streamOf([{ payload: { id: "t1", text: "ok" }, type: "text-delta" }])
    );

    const { emitted } = await drive();

    expect(typesOf(emitted)).not.toContain(EventType.STATE_SNAPSHOT);
  });

  it("surfaces a SECOND park instead of reporting success", async () => {
    // The normal shape here: this lane runs under `approvalPolicy: "suspend"`, so
    // any gated tool the continuation reaches for parks the run again. Left
    // unhandled the resume looks like a run that finished with nothing to say,
    // and the caller clears an interrupt that is still waiting for the user.
    resumeStream.mockResolvedValue(
      streamOf([
        {
          payload: {
            result: "The user selected: Option A",
            toolCallId: "call-1",
            toolName: "requestDecision",
          },
          type: "tool-result",
        },
        {
          payload: {
            args: { path: "/shared/x" },
            suspendPayload: { kind: "tool_approval" },
            toolCallId: "call-2",
            toolName: "engenty_tool_execute",
          },
          type: "tool-call-suspended",
        },
      ])
    );

    const { accumulator, outcome } = await drive();

    expect(outcome.suspendedAgain).toMatchObject({
      args: { path: "/shared/x" },
      suspendPayload: { kind: "tool_approval" },
      toolCallId: "call-2",
      toolName: "engenty_tool_execute",
    });
    // A parked call is legitimately resultless — erroring it out would settle the
    // very interrupt this resume just raised.
    expect(accumulator.getUnresolvedToolCalls()).toEqual([]);
  });

  it("reports an in-band failure rather than a clean finish", async () => {
    // A failed resume reported as completed writes a success into history and
    // CLEARS the open interrupt, deleting the only pointer back to a turn that
    // never produced an answer.
    resumeStream.mockResolvedValue(
      streamOf([{ payload: { error: "gateway exploded" }, type: "error" }])
    );

    const { outcome } = await drive();

    expect(outcome.streamError).toContain("gateway exploded");
  });

  it("reports a thrown resume as a failure, not a rejection", async () => {
    resumeStream.mockRejectedValue(new Error("no snapshot"));
    const { outcome } = await drive();
    expect(outcome.streamError).toContain("no snapshot");
  });
});

describe("I2: what upstream drops, put back", () => {
  it("restores untilIdle, which @ag-ui/mastra never forwards", async () => {
    // `untilIdle` keeps the outer stream open across continuations a
    // background task triggers. NOTHING in this codebase declares a
    // background-enabled tool today, so losing it would change nothing
    // observable — which is exactly why it needs a test rather than a reader.
    resumeStream.mockResolvedValue(
      streamOf([{ payload: { id: "t1", text: "ok" }, type: "text-delta" }])
    );

    await drive();

    expect(resumeStream).toHaveBeenCalledWith(
      { approved: true },
      expect.objectContaining({ untilIdle: true })
    );
    // ...without dropping what upstream DOES set.
    expect(resumeStream).toHaveBeenCalledWith(
      { approved: true },
      expect.objectContaining({
        runId: "run-suspended-1",
        toolCallId: "call-1",
      })
    );
  });

  it("catches a stream that FINISHED on an error without throwing", async () => {
    // The reason the proxy holds on to the stream object:
    // a gateway context_length_exceeded ends the stream cleanly, emits no error
    // event, and would otherwise be written into history as a successful resume
    // with the open interrupt cleared.
    resumeStream.mockResolvedValue({
      finishReason: "error",
      fullStream: (async function* () {
        yield {
          payload: { id: "t1", text: "half an ans" },
          type: "text-delta",
        };
      })(),
      getFullOutput: async () => ({
        error: new Error("context_length_exceeded"),
        finishReason: "error",
      }),
    });

    const { outcome } = await drive();

    expect(outcome.streamError).toBe("agent_threads.contextLengthExceeded");
  });

  it("leaves a clean finish clean", async () => {
    // The other half: the failure check must not invent a failure.
    resumeStream.mockResolvedValue({
      finishReason: "stop",
      fullStream: (async function* () {
        yield { payload: { id: "t1", text: "done" }, type: "text-delta" };
      })(),
      getFullOutput: async () => ({ finishReason: "stop" }),
    });

    const { outcome } = await drive();

    expect(outcome.streamError).toBeNull();
  });
});

describe("I2: what the wire keeps", () => {
  it("expands text chunks, because this wire is defined on the expanded form", async () => {
    // `run-tracking` coalesces TEXT_MESSAGE_CONTENT into merged rows and every
    // replay reads them back. Emitting raw CHUNK would be one database row per
    // token and a shape the stored history has never carried.
    resumeStream.mockResolvedValue(
      streamOf([
        { payload: { id: "t1" }, type: "text-start" },
        { payload: { id: "t1", text: "recovered" }, type: "text-delta" },
        { payload: { id: "t1" }, type: "text-end" },
      ])
    );

    const { emitted } = await drive();
    const types = typesOf(emitted);

    expect(types).toContain(EventType.TEXT_MESSAGE_START);
    expect(types).toContain(EventType.TEXT_MESSAGE_CONTENT);
    expect(types).toContain(EventType.TEXT_MESSAGE_END);
    expect(types).not.toContain(EventType.TEXT_MESSAGE_CHUNK);
  });

  it("keeps the partial answer when the stream dies mid-text", async () => {
    // The reason this driver subscribes to `run()` instead of `runAgent()`:
    // AG-UI's client pipeline BUFFERS the chunk expansion, so a stream that died
    // here delivered the START and dropped the text — for exactly the failure the
    // transcript safety net exists to rescue.
    resumeStream.mockResolvedValue(
      streamOf([
        { payload: { id: "t1" }, type: "text-start" },
        { payload: { id: "t1", text: "half an answer" }, type: "text-delta" },
        { payload: { error: { message: "boom" } }, type: "error" },
      ])
    );

    const { accumulator, outcome } = await drive();

    expect(outcome.streamError).toBe("boom");
    expect(accumulator.getTranscriptParts()).toEqual([
      { text: "half an answer", type: "text" },
    ]);
  });

  it("keeps native sub-agent progress, which upstream does not recognise", async () => {
    // Mastra memory drops these lines, so the fold-back onto the
    // persisted delegation part is the only thing that keeps the card's Log
    // across a reload.
    resumeStream.mockResolvedValue(
      streamOf([
        {
          payload: {
            args: {},
            toolCallId: "call-agent",
            toolName: "agent-cli",
          },
          type: "tool-call",
        },
        {
          payload: { text: "cloning the repo" },
          type: "agent-execution-event-progress",
        },
      ])
    );

    const { accumulator, emitted } = await drive();

    expect([...accumulator.getSubAgentProgressLines()]).toEqual([
      ["call-agent", ["cloning the repo"]],
    ]);
    expect(emitted.some((e) => e.name === "engenty.sub_agent.progress")).toBe(
      true
    );
  });
});
