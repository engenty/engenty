import { describe, expect, it, vi } from "vitest";
import type {
  RoutineRow,
  RoutineStore,
} from "../../../dal/routines/routine-store.js";
import type { ThreadRow } from "../../../dal/threads/types.js";
import {
  buildRoutineReportText,
  reportRoutineRun,
  resolveReportingLevel,
} from "../report-routine-run.js";

vi.mock("../../index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../index.js")>();
  return {
    ...actual,
    createRoutineOutcomeStoreFromEnv: () => ({
      list: async () => [] as const,
    }),
  };
});

const TENANT = "11111111-1111-4111-8111-111111111111";
const OWNER = "22222222-2222-4222-8222-222222222222";
const SPACE = "33333333-3333-4333-8333-333333333333";
const RUN_THREAD = "44444444-4444-4444-8444-444444444444";
const CHAT_THREAD = "55555555-5555-4555-8555-555555555555";

function routine(patch: Partial<RoutineRow> = {}): RoutineRow {
  return {
    agent_id: "finance.stock-quotes",
    created_by_user_id: OWNER,
    id: "01a03ab6",
    name: "Aktienkurse alle 10 Minuten",
    report: "desk_card",
    space_id: SPACE,
    tenant_id: TENANT,
    ...patch,
  } as RoutineRow;
}

function thread(patch: Partial<ThreadRow> = {}): ThreadRow {
  return {
    agent_id: "finance.stock-quotes",
    created_by_user_id: OWNER,
    id: CHAT_THREAD,
    route_context: {},
    space_id: SPACE,
    updated_at: "2026-08-25T21:00:00.000Z",
    ...patch,
  } as ThreadRow;
}

function harness(
  options: {
    routine?: RoutineRow | null;
    threads?: ThreadRow[];
    messages?: { parts: unknown; role: string }[];
  } = {}
) {
  const appendMessage = vi.fn(async (_input: Record<string, unknown>) => ({
    message: {} as never,
  }));
  const upsertThread = vi.fn(async () => ({
    thread: thread({ id: "created-thread" }),
  }));
  const store = {
    appendMessage,
    // The upsert helper reads the row first — see thread-upsert-preserve.ts.
    getThread: vi.fn(async () => null),
    listMessagesOrdered: vi.fn(async () => options.messages ?? []),
    listThreadsForSpaceAgent: vi.fn(async () => options.threads ?? []),
    upsertThread,
  } as never;
  const routines = {
    get: vi.fn(async () =>
      options.routine === undefined ? routine() : options.routine
    ),
  } as unknown as RoutineStore;
  return { appendMessage, routines, store, upsertThread };
}

const ASSISTANT_RESULT = [
  { parts: [{ text: "ignored", type: "text" }], role: "user" },
  {
    parts: [{ type: "reasoning" }, { text: "AAPL 309,45 USD", type: "text" }],
    role: "assistant",
  },
];

describe("buildRoutineReportText", () => {
  it("names the routine so a machine post is never mistaken for a reply", () => {
    expect(
      buildRoutineReportText({
        body: "AAPL 309,45 USD",
        name: "Aktienkurse alle 10 Minuten",
        status: "completed",
      })
    ).toBe("**Routine · Aktienkurse alle 10 Minuten**\n\nAAPL 309,45 USD");
  });

  it("reports a failure with the run's own reason", () => {
    expect(
      buildRoutineReportText({
        body: null,
        name: "Nightly",
        reason: "web_search timed out",
        status: "failed",
      })
    ).toContain("Run failed: web_search timed out");
  });

  it("still says something when a run finished silently", () => {
    // Silence that looks like success is the failure shape this replaces.
    expect(
      buildRoutineReportText({
        body: null,
        name: "Nightly",
        status: "completed",
      })
    ).toContain("without a written result");
  });
});

describe("reportRoutineRun", () => {
  it("also posts the report into the room of the agent this one reports to", async () => {
    const h = harness({ messages: ASSISTANT_RESULT });
    // The owner already talks to the routine's agent; the chief has no room yet.
    (
      h.store as unknown as { listThreadsForSpaceAgent: unknown }
    ).listThreadsForSpaceAgent = vi.fn(
      async ({ agentId }: { agentId: string }) =>
        agentId === "finance.stock-quotes" ? [thread()] : []
    );
    await reportRoutineRun({
      resolveReportsTo: async () => "chief-of-staff",
      routineId: "routine-1",
      routines: h.routines,
      runId: "run-1",
      status: "completed",
      store: h.store,
      tenantId: "tenant-1",
      threadId: "fire-thread",
    });
    expect(h.appendMessage).toHaveBeenCalledTimes(2);
    const upward = h.appendMessage.mock.calls[1]?.[0] as {
      metadata: Record<string, unknown>;
      parts: { text: string }[];
      threadId: string;
    };
    expect(upward.metadata).toMatchObject({ reports_to: "chief-of-staff" });
    expect(upward.parts[0]?.text).toContain("AAPL 309,45 USD");
    expect(upward.parts[0]?.text).toContain("Reported by");
    // The chief's room did not exist; it was created for the report.
    expect(h.upsertThread).toHaveBeenCalled();
  });

  it("posts once when the agent reports to nobody", async () => {
    const h = harness({
      messages: ASSISTANT_RESULT,
      threads: [thread()],
    });
    await reportRoutineRun({
      resolveReportsTo: async () => null,
      routineId: "routine-1",
      routines: h.routines,
      runId: "run-1",
      status: "completed",
      store: h.store,
      tenantId: "tenant-1",
      threadId: "fire-thread",
    });
    expect(h.appendMessage).toHaveBeenCalledTimes(1);
  });

  it("posts the fire's result into the owner's chat with that specialist", async () => {
    const h = harness({
      messages: ASSISTANT_RESULT,
      threads: [thread()],
    });
    await reportRoutineRun({
      resolveReportsTo: async () => null,
      routineId: "01a03ab6",
      routines: h.routines,
      runId: "run-1",
      status: "completed",
      store: h.store,
      tenantId: TENANT,
      threadId: RUN_THREAD,
    });
    expect(h.appendMessage).toHaveBeenCalledTimes(1);
    const posted = h.appendMessage.mock.calls[0]?.[0] as never as {
      metadata: Record<string, unknown>;
      parts: { text: string }[];
      role: string;
      threadId: string;
    };
    expect(posted.threadId).toBe(CHAT_THREAD);
    expect(posted.role).toBe("assistant");
    expect(posted.parts[0]?.text).toContain("AAPL 309,45 USD");
    expect(posted.metadata.routine_id).toBe("01a03ab6");
  });

  it("says nothing at all when the routine is quiet", async () => {
    const h = harness({ routine: routine({ report: "quiet" }) });
    await reportRoutineRun({
      routineId: "01a03ab6",
      routines: h.routines,
      runId: "run-1",
      status: "completed",
      store: h.store,
      tenantId: TENANT,
      threadId: RUN_THREAD,
    });
    expect(h.appendMessage).not.toHaveBeenCalled();
  });

  it("never reports into another fire's thread", async () => {
    // Every thread this specialist owns in the Space is a run thread — the
    // person has never chatted with it. Posting into one would put the report
    // in a room nobody opens, which is the silence this exists to end.
    const h = harness({
      messages: ASSISTANT_RESULT,
      threads: [
        thread({
          created_by_user_id: null,
          id: "fire-thread",
          route_context: { routine_id: "01a03ab6" },
        }),
      ],
    });
    await reportRoutineRun({
      resolveReportsTo: async () => null,
      routineId: "01a03ab6",
      routines: h.routines,
      runId: "run-1",
      status: "completed",
      store: h.store,
      tenantId: TENANT,
      threadId: RUN_THREAD,
    });
    // resolveRoutineOwnerThread creates the desk, then speakOnDesk
    // re-resolves it (the list mock still only returns the fire thread).
    expect(h.upsertThread).toHaveBeenCalledTimes(2);
    const posted = h.appendMessage.mock.calls[0]?.[0] as never as {
      threadId: string;
    };
    expect(posted.threadId).toBe("created-thread");
  });

  it("stays silent when the routine has no owner to report to", async () => {
    const h = harness({ routine: routine({ created_by_user_id: null }) });
    await reportRoutineRun({
      routineId: "01a03ab6",
      routines: h.routines,
      runId: "run-1",
      status: "completed",
      store: h.store,
      tenantId: TENANT,
      threadId: RUN_THREAD,
    });
    expect(h.appendMessage).not.toHaveBeenCalled();
  });

  it("reports a failed fire rather than letting it pass unnoticed", async () => {
    const h = harness({ threads: [thread()] });
    await reportRoutineRun({
      reason: "space_context_unresolved",
      routineId: "01a03ab6",
      routines: h.routines,
      runId: "run-1",
      status: "failed",
      store: h.store,
      tenantId: TENANT,
      threadId: RUN_THREAD,
    });
    const posted = h.appendMessage.mock.calls[0]?.[0] as never as {
      parts: { text: string }[];
    };
    expect(posted.parts[0]?.text).toContain("space_context_unresolved");
  });

  it("never lets a reporting failure rewrite the run", async () => {
    const h = harness({ threads: [thread()] });
    h.routines.get = vi.fn(async () => {
      throw new Error("routines table gone");
    }) as never;
    await expect(
      reportRoutineRun({
        routineId: "01a03ab6",
        routines: h.routines,
        runId: "run-1",
        status: "completed",
        store: h.store,
        tenantId: TENANT,
        threadId: RUN_THREAD,
      })
    ).resolves.toBeUndefined();
  });
});

describe("report: ask", () => {
  it("never lets an ask routine end in silence, even on nothing_to_do", () => {
    expect(
      resolveReportingLevel({
        outcome: "nothing_to_do",
        routineReport: "ask",
        status: "completed",
      })
    ).toBe("info");
    expect(
      resolveReportingLevel({
        reporting: "silent",
        routineReport: "ask",
        status: "completed",
      })
    ).toBe("info");
  });

  it("tells the reader the run is waiting on them", () => {
    const text = buildRoutineReportText({
      awaitingReview: true,
      body: "3 replies found",
      name: "Mail-Antwort-Wache",
      status: "completed",
    });
    expect(text).toContain("3 replies found");
    expect(text).toContain("Waiting for your review");
  });

  it("posts the held run's report without a second inbox update", async () => {
    const h = harness({
      messages: ASSISTANT_RESULT,
      routine: routine({ report: "ask" }),
      threads: [thread()],
    });
    await reportRoutineRun({
      awaitingReview: true,
      resolveReportsTo: async () => null,
      routineId: "01a03ab6",
      routines: h.routines,
      runId: "run-1",
      status: "completed",
      store: h.store,
      tenantId: TENANT,
      threadId: RUN_THREAD,
    });
    expect(h.appendMessage).toHaveBeenCalledTimes(1);
    const text = (
      h.appendMessage.mock.calls[0]?.[0] as {
        parts: { text: string }[];
      }
    ).parts[0]?.text;
    expect(text).toContain("Waiting for your review");
  });
});

describe("resolveReportingLevel", () => {
  it("lets the run's own level beat the routine's knob, both directions", () => {
    expect(
      resolveReportingLevel({
        reporting: "verbose",
        routineReport: "quiet",
        status: "completed",
      })
    ).toBe("verbose");
    expect(
      resolveReportingLevel({
        reporting: "silent",
        routineReport: "desk_card",
        status: "completed",
      })
    ).toBe("silent");
  });

  it("defaults nothing_to_do to silent — the quiet report is a consequence", () => {
    expect(
      resolveReportingLevel({
        outcome: "nothing_to_do",
        routineReport: "desk_card",
        status: "completed",
      })
    ).toBe("silent");
  });

  it("never silences a crash or work that went wrong", () => {
    expect(
      resolveReportingLevel({
        reporting: "silent",
        routineReport: "quiet",
        status: "failed",
      })
    ).toBe("info");
    for (const outcome of ["failed", "rejected", "needs_attention"] as const) {
      expect(
        resolveReportingLevel({
          outcome,
          reporting: "silent",
          routineReport: "quiet",
          status: "completed",
        })
      ).toBe("info");
    }
  });

  it("maps the routine knob when the run says nothing", () => {
    expect(
      resolveReportingLevel({ routineReport: "quiet", status: "completed" })
    ).toBe("silent");
    expect(
      resolveReportingLevel({ routineReport: "desk_card", status: "completed" })
    ).toBe("info");
    expect(
      resolveReportingLevel({ routineReport: "ask", status: "completed" })
    ).toBe("info");
  });
});

describe("reportRoutineRun with a run contract", () => {
  it("posts nothing for ok + silent", async () => {
    const h = harness({ messages: ASSISTANT_RESULT, threads: [thread()] });
    await reportRoutineRun({
      outcome: "ok",
      reporting: "silent",
      routineId: "01a03ab6",
      routines: h.routines,
      runId: "run-s",
      status: "completed",
      store: h.store,
      tenantId: TENANT,
      threadId: RUN_THREAD,
    });
    expect(h.appendMessage).not.toHaveBeenCalled();
  });

  it("reports a rejected outcome even on a quiet routine, with the label", async () => {
    const h = harness({
      messages: ASSISTANT_RESULT,
      routine: routine({ report: "quiet" }),
      threads: [thread()],
    });
    await reportRoutineRun({
      outcome: "rejected",
      reason: "counterparty declined the import",
      routineId: "01a03ab6",
      routines: h.routines,
      runId: "run-r",
      status: "completed",
      store: h.store,
      tenantId: TENANT,
      threadId: RUN_THREAD,
    });
    expect(h.appendMessage).toHaveBeenCalledTimes(1);
    const posted = h.appendMessage.mock.calls[0]?.[0] as never as {
      parts: { text: string }[];
    };
    expect(posted.parts[0]?.text).toContain("rejected");
    expect(posted.parts[0]?.text).toContain("counterparty declined");
  });

  it("verbose carries the run's whole narrative, not just its last word", async () => {
    const h = harness({
      messages: [
        {
          parts: [{ text: "Reading the inbox", type: "text" }],
          role: "assistant",
        },
        { parts: [{ text: "3 imported", type: "text" }], role: "assistant" },
      ],
      threads: [thread()],
    });
    await reportRoutineRun({
      reporting: "verbose",
      routineId: "01a03ab6",
      routines: h.routines,
      runId: "run-v",
      status: "completed",
      store: h.store,
      tenantId: TENANT,
      threadId: RUN_THREAD,
    });
    const posted = h.appendMessage.mock.calls[0]?.[0] as never as {
      parts: { text: string }[];
    };
    expect(posted.parts[0]?.text).toContain("Reading the inbox");
    expect(posted.parts[0]?.text).toContain("3 imported");
  });
});
