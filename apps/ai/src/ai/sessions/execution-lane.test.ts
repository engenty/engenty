import { EventType } from "@engenty/ag-ui-bridge";
import { describe, expect, it, vi } from "vitest";
import {
  classifyExecutionLane,
  type ExecutionLaneSource,
  emitExecutionLaneRunStarted,
  executionSpaceId,
} from "./execution-lane.js";

describe("execution lane classification", () => {
  it.each<{
    expected: "live" | "delegated_live" | "task" | "flow_task";
    name: string;
    source: ExecutionLaneSource;
  }>([
    {
      expected: "live",
      name: "Copilot live",
      source: { kind: "live" },
    },
    {
      expected: "delegated_live",
      name: "message_agent child",
      source: { agentId: "contacts.manager", kind: "delegated" },
    },
    {
      expected: "task",
      name: "ordinary specialist Task",
      source: {
        agentId: "contacts.manager",
        kind: "delegated",
        taskId: "task-1",
      },
    },
    {
      // The coordinator has no lane of its own: a task it was assigned is a
      // task, the same as any other engenty's.
      expected: "task",
      name: "Coordinator-assigned Task",
      source: {
        agentId: "engenty.coordinator",
        kind: "delegated",
        taskId: "task-2",
      },
    },
    {
      expected: "flow_task",
      name: "Flow Task",
      source: { kind: "flow_task" },
    },
  ])("classifies and emits $name", ({ expected, source }) => {
    expect(classifyExecutionLane(source)).toBe(expected);
    const emit = vi.fn();
    const info = vi.fn();
    const taskId =
      source.kind === "delegated"
        ? source.taskId
        : source.kind === "flow_task"
          ? "flow-task-1"
          : undefined;
    const marker = emitExecutionLaneRunStarted(
      {
        agentId:
          source.kind === "delegated" ? source.agentId : "engenty.copilot",
        runId: `run-${expected}`,
        source,
        taskId,
        threadId: `thread-${expected}`,
      },
      { emit, logger: { info } }
    );

    expect(marker.execution_lane).toBe(expected);
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        execution_lane: expected,
        type: EventType.RUN_STARTED,
      })
    );
    expect(info).toHaveBeenCalledWith("run started", marker);
  });
});

describe("execution lane run-start emission", () => {
  it("adds the typed marker and available ids to logs and RUN_STARTED", () => {
    const emit = vi.fn();
    const info = vi.fn();

    const marker = emitExecutionLaneRunStarted(
      {
        agentId: "contacts.manager",
        runId: "run-1",
        source: {
          agentId: "contacts.manager",
          kind: "delegated",
          taskId: "task-1",
        },
        spaceId: "space-1",
        taskId: "task-1",
        threadId: "thread-1",
      },
      { emit, logger: { info } }
    );

    expect(marker).toEqual({
      agent_id: "contacts.manager",
      execution_lane: "task",
      run_id: "run-1",
      space_id: "space-1",
      task_id: "task-1",
      thread_id: "thread-1",
    });
    expect(info).toHaveBeenCalledWith("run started", marker);
    expect(emit).toHaveBeenCalledWith({
      ...marker,
      runId: "run-1",
      threadId: "thread-1",
      type: EventType.RUN_STARTED,
    });
  });

  it("reads resolved and unresolved Space ids without logging surface data", () => {
    expect(executionSpaceId({ space: { spaceId: "space-1" } })).toBe("space-1");
    expect(executionSpaceId({ claimed_space_id: "space-2" })).toBe("space-2");
  });
});
