/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const activity = vi.fn();
const runQuery = vi.fn();
vi.mock("../agent-desk/use-agent-routine-activity.js", () => ({
  useAgentRoutineActivity: () => activity(),
}));
vi.mock("../workflow-canvas/workflow-queries.js", () => ({
  useWorkflowRunQuery: (runId: string | undefined) => runQuery(runId),
}));

const { useDeskWizardStep } = await import("./use-desk-wizard-step.js");

const gate = {
  accepts_text: true,
  kind: "surface" as const,
  path: ["draft-loop", "review"],
  stepId: "review",
  surface: { components: [], data: {} },
};

function snapshotQuery(input: {
  answers?: Record<string, unknown>;
  gate?: typeof gate;
  runStatus?: string;
  status: string;
  summary?: string;
  threadId?: string;
}) {
  return {
    data: {
      request: {
        status: input.runStatus ?? "requires_action",
        summary: input.summary,
        thread_id: input.threadId ?? "thread-1",
      },
      snapshot: {
        answers: input.answers,
        gate: input.gate,
        nodes: {},
        status: input.status,
      },
      version: { graph: { graph: [], id: "g" } },
    },
    refetch: vi.fn(),
  };
}

describe("useDeskWizardStep", () => {
  it("docks the gate of a discovered fire once it is suspended", () => {
    activity.mockReturnValue({ runId: "run-1", threadId: "thread-1" });
    runQuery.mockReturnValue(
      snapshotQuery({
        answers: { review: { approved: true, data: { notes: "shorter" } } },
        gate,
        status: "suspended",
      })
    );
    const { result } = renderHook(() =>
      useDeskWizardStep({ agentId: "offers.manager" })
    );
    expect(runQuery).toHaveBeenLastCalledWith("run-1");
    expect(result.current?.state).toBe("gate");
    expect(result.current?.gate?.stepId).toBe("review");
    expect(result.current?.answer?.data).toEqual({ notes: "shorter" });
    expect(result.current?.threadId).toBe("thread-1");
  });

  it("watches a pressed wizard ahead of the discovery", () => {
    activity.mockReturnValue({ runId: "fire", threadId: "t-fire" });
    runQuery.mockReturnValue(snapshotQuery({ gate, status: "suspended" }));
    const { result } = renderHook(() =>
      useDeskWizardStep({ agentId: "a", pressedRunId: "pressed" })
    );
    expect(runQuery).toHaveBeenLastCalledWith("pressed");
    expect(result.current?.runId).toBe("pressed");
  });

  it("docks nothing for a DISCOVERED fire while the run is still moving", () => {
    activity.mockReturnValue({ runId: "run-1", threadId: "thread-1" });
    runQuery.mockReturnValue(snapshotQuery({ status: "running" }));
    const { result } = renderHook(() => useDeskWizardStep({ agentId: "a" }));
    expect(result.current).toBeNull();
  });

  // A pressed wizard is the composer's business until it settles: between two
  // gates the dock says the run is working, which is what the first cut left
  // out — an empty dock read as a card that had crashed.
  it("keeps a PRESSED wizard docked between two gates", () => {
    activity.mockReturnValue(null);
    runQuery.mockReturnValue(snapshotQuery({ status: "running" }));
    const { result } = renderHook(() =>
      useDeskWizardStep({ agentId: "a", pressedRunId: "pressed" })
    );
    expect(result.current?.state).toBe("running");
    expect(result.current?.gate).toBeNull();
  });

  // The query stops polling on a suspended snapshot, and a step that has
  // suspended without a readable gate yet is exactly that — the dock has to
  // keep asking or it says "working" forever on one answer.
  it("keeps asking while a pressed run is neither parked nor settled", () => {
    vi.useFakeTimers();
    activity.mockReturnValue(null);
    const query = snapshotQuery({ status: "running" });
    runQuery.mockReturnValue(query);
    renderHook(() => useDeskWizardStep({ agentId: "a", pressedRunId: "p" }));
    expect(query.refetch).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(4100);
    });
    expect(query.refetch.mock.calls.length).toBeGreaterThanOrEqual(2);
    vi.useRealTimers();
  });

  it("stops asking once the run parks at a gate", () => {
    vi.useFakeTimers();
    activity.mockReturnValue(null);
    const query = snapshotQuery({ gate, status: "suspended" });
    runQuery.mockReturnValue(query);
    renderHook(() => useDeskWizardStep({ agentId: "a", pressedRunId: "p" }));
    act(() => {
      vi.advanceTimersByTime(4100);
    });
    expect(query.refetch).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("hands a settled pressed wizard its closing line", () => {
    activity.mockReturnValue(null);
    runQuery.mockReturnValue(
      snapshotQuery({
        runStatus: "completed",
        status: "success",
        summary: "Das Angebot ist angelegt.",
      })
    );
    const { result } = renderHook(() =>
      useDeskWizardStep({ agentId: "a", pressedRunId: "pressed" })
    );
    expect(result.current?.state).toBe("settled");
    expect(result.current?.summary).toBe("Das Angebot ist angelegt.");
  });

  it("docks nothing for a review hold (suspended without a gate)", () => {
    activity.mockReturnValue({ runId: "run-1", threadId: "thread-1" });
    runQuery.mockReturnValue(snapshotQuery({ status: "suspended" }));
    const { result } = renderHook(() => useDeskWizardStep({ agentId: "a" }));
    expect(result.current).toBeNull();
  });

  it("docks nothing without a run to watch", () => {
    activity.mockReturnValue(null);
    runQuery.mockReturnValue({ data: undefined, refetch: vi.fn() });
    const { result } = renderHook(() => useDeskWizardStep({ agentId: "a" }));
    expect(runQuery).toHaveBeenLastCalledWith(undefined);
    expect(result.current).toBeNull();
  });
});
