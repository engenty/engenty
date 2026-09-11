import { describe, expect, it } from "vitest";
import type { TaskRun } from "../../src/schema/types.js";
import {
  filterMessagesToRunWindow,
  resolveRunTranscriptWindow,
} from "./task-run-transcript-window.js";

function run(input: {
  createdAt: string;
  id: string;
  threadId?: string | null;
}): TaskRun {
  return {
    agent_session_run_id: input.id,
    agent_thread_id: input.threadId ?? "thread-a",
    created_at: input.createdAt,
    id: `row-${input.id}`,
    role: "checkout",
    scope_id: "scope-1",
    task_id: "task-1",
    tenant_id: "tenant-1",
  };
}

function message(createdAt: string | null) {
  return {
    id: `m-${createdAt ?? "none"}`,
    metadata: createdAt ? { created_at: createdAt } : {},
  };
}

describe("resolveRunTranscriptWindow", () => {
  it("bounds a run by the next run that shares its thread", () => {
    const runs = [
      run({ createdAt: "2026-08-17T10:00:00Z", id: "r1" }),
      run({ createdAt: "2026-08-17T11:00:00Z", id: "r2" }),
    ];
    expect(resolveRunTranscriptWindow(runs, "r1")).toEqual({
      endAt: "2026-08-17T11:00:00Z",
      startAt: "2026-08-17T10:00:00Z",
    });
  });

  it("leaves the newest run open-ended so a live run keeps streaming in", () => {
    const runs = [
      run({ createdAt: "2026-08-17T10:00:00Z", id: "r1" }),
      run({ createdAt: "2026-08-17T11:00:00Z", id: "r2" }),
    ];
    expect(resolveRunTranscriptWindow(runs, "r2")).toEqual({
      endAt: null,
      startAt: "2026-08-17T11:00:00Z",
    });
  });

  it("ignores a later run on a DIFFERENT thread — reassignment starts a new one", () => {
    const runs = [
      run({ createdAt: "2026-08-17T10:00:00Z", id: "r1" }),
      run({
        createdAt: "2026-08-17T11:00:00Z",
        id: "r2",
        threadId: "thread-b",
      }),
    ];
    expect(resolveRunTranscriptWindow(runs, "r1")?.endAt).toBeNull();
  });

  it("orders by created_at rather than trusting list order", () => {
    const runs = [
      run({ createdAt: "2026-08-17T12:00:00Z", id: "r3" }),
      run({ createdAt: "2026-08-17T10:00:00Z", id: "r1" }),
      run({ createdAt: "2026-08-17T11:00:00Z", id: "r2" }),
    ];
    expect(resolveRunTranscriptWindow(runs, "r1")?.endAt).toBe(
      "2026-08-17T11:00:00Z"
    );
  });

  it("returns null for a run that is not in the list", () => {
    expect(resolveRunTranscriptWindow([], "r1")).toBeNull();
  });
});

describe("filterMessagesToRunWindow", () => {
  const window = {
    endAt: "2026-08-17T11:00:00Z",
    startAt: "2026-08-17T10:00:00Z",
  };

  it("keeps only what was written inside the window", () => {
    const kept = filterMessagesToRunWindow(
      [
        message("2026-08-17T09:59:59Z"),
        message("2026-08-17T10:00:00Z"),
        message("2026-08-17T10:30:00Z"),
        message("2026-08-17T11:00:00Z"),
      ],
      window
    );
    expect(kept.map((m) => m.id)).toEqual([
      "m-2026-08-17T10:00:00Z",
      "m-2026-08-17T10:30:00Z",
    ]);
  });

  it("keeps an unplaceable message rather than losing it", () => {
    const kept = filterMessagesToRunWindow([message(null)], window);
    expect(kept).toHaveLength(1);
  });

  it("passes everything through when the run could not be bounded", () => {
    const messages = [message("2026-08-01T00:00:00Z"), message(null)];
    expect(filterMessagesToRunWindow(messages, null)).toHaveLength(2);
  });
});
