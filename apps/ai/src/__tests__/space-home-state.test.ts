import { AG_UI_OPEN_INTERRUPT_METADATA_KEY } from "@engenty/ag-ui-bridge";
import { describe, expect, it } from "vitest";
import {
  markdownToExcerptText,
  resolveSpaceHomeStates,
  resolveSpaceHomeThreadState,
  type SpaceHomeRunInput,
  type SpaceHomeThreadInput,
} from "../ai/spaces/space-home-state.js";

const NOW = Date.parse("2026-09-09T08:00:00.000Z");
const SINCE = Date.parse("2026-09-09T06:00:00.000Z");

function thread(
  overrides: Partial<SpaceHomeThreadInput> = {}
): SpaceHomeThreadInput {
  return {
    agent_id: "coder",
    id: "t1",
    metadata: {},
    route_context: {},
    title: "Game Coder",
    updated_at: "2026-09-09T07:50:00.000Z",
    ...overrides,
  };
}

function run(overrides: Partial<SpaceHomeRunInput> = {}): SpaceHomeRunInput {
  return {
    agent_id: "coder",
    finished_at: null,
    id: "r1",
    started_at: "2026-09-09T07:55:00.000Z",
    status: "running",
    thread_id: "t1",
    trigger: "message",
    ...overrides,
  };
}

function openInterrupt(extra: Record<string, unknown> = {}) {
  return {
    [AG_UI_OPEN_INTERRUPT_METADATA_KEY]: {
      artifact_id: "a1",
      interrupt_id: "i1",
      kind: "decision",
      title: "deploy_board ausführen?",
      tool_call_id: "tc1",
      tool_name: "deploy_board",
      ...extra,
    },
  };
}

describe("resolveSpaceHomeThreadState", () => {
  it("is quiet with no runs and no interrupt", () => {
    const state = resolveSpaceHomeThreadState({
      nowMs: NOW,
      runs: [],
      sinceMs: SINCE,
      thread: thread(),
    });
    expect(state.state).toBe("quiet");
    expect(state.jobs).toEqual([]);
  });

  it("runs while a run is running", () => {
    const state = resolveSpaceHomeThreadState({
      nowMs: NOW,
      runs: [run()],
      sinceMs: SINCE,
      thread: thread(),
    });
    expect(state.state).toBe("running");
    expect(state.jobs).toHaveLength(1);
  });

  it("waits on an open interrupt, and quotes it", () => {
    const state = resolveSpaceHomeThreadState({
      nowMs: NOW,
      runs: [],
      sinceMs: SINCE,
      thread: thread({ metadata: openInterrupt({ body: "zwei Partien" }) }),
    });
    expect(state.state).toBe("waiting");
    expect(state.jobs[0]?.interrupt).toEqual({
      artifact_id: "a1",
      body: "zwei Partien",
      kind: "decision",
      title: "deploy_board ausführen?",
      tool_name: "deploy_board",
    });
  });

  it("ignores an expired interrupt — its buttons could not resume", () => {
    const state = resolveSpaceHomeThreadState({
      nowMs: NOW,
      runs: [],
      sinceMs: SINCE,
      thread: thread({
        metadata: openInterrupt({ expires_at: "2026-09-09T07:00:00.000Z" }),
      }),
    });
    expect(state.state).toBe("quiet");
  });

  it("shows the run that parked as one job, not two", () => {
    const state = resolveSpaceHomeThreadState({
      nowMs: NOW,
      runs: [run({ id: "r9", status: "requires_action" })],
      sinceMs: SINCE,
      thread: thread({ metadata: openInterrupt({ run_id: "r9" }) }),
    });
    expect(state.jobs).toHaveLength(1);
    expect(state.jobs[0]?.state).toBe("waiting");
  });

  it("pauses a room at the turn budget, above a running job", () => {
    const state = resolveSpaceHomeThreadState({
      nowMs: NOW,
      runs: [run()],
      sinceMs: SINCE,
      thread: thread({
        metadata: { agent_turns_since_human: 12, room_paused: true },
      }),
    });
    expect(state.state).toBe("paused");
    expect(state.agent_turns).toBe(12);
    expect(state.jobs.map((job) => job.state)).toEqual(["paused", "running"]);
  });

  it("waiting outranks a pause — both are stuck on a person", () => {
    const state = resolveSpaceHomeThreadState({
      nowMs: NOW,
      runs: [],
      sinceMs: SINCE,
      thread: thread({
        metadata: { ...openInterrupt(), room_paused: true },
      }),
    });
    expect(state.state).toBe("waiting");
  });

  it("keeps one live job per state, but every finished run", () => {
    const state = resolveSpaceHomeThreadState({
      nowMs: NOW,
      runs: [
        run({ id: "r1", status: "requires_action" }),
        run({ id: "r2", status: "requires_action" }),
        run({ id: "r3", status: "running" }),
        run({
          finished_at: "2026-09-09T07:10:00.000Z",
          id: "r4",
          status: "completed",
        }),
        run({
          finished_at: "2026-09-09T07:20:00.000Z",
          id: "r5",
          status: "completed",
        }),
      ],
      sinceMs: SINCE,
      thread: thread(),
    });
    expect(state.jobs.map((job) => job.state)).toEqual([
      "waiting",
      "running",
      "done",
      "done",
    ]);
  });

  it("carries the newest message as one line, or nothing", () => {
    const withText = resolveSpaceHomeThreadState({
      nowMs: NOW,
      runs: [],
      sinceMs: SINCE,
      thread: thread({
        last_message: {
          created_at: "2026-09-09T07:40:00.000Z",
          parts: [{ text: "  Zwei\nZeilen  ", type: "text" }],
          role: "assistant",
        },
      }),
    });
    expect(withText.last_message).toEqual({
      at: "2026-09-09T07:40:00.000Z",
      excerpt: "Zwei Zeilen",
      role: "assistant",
    });

    const toolOnly = resolveSpaceHomeThreadState({
      nowMs: NOW,
      runs: [],
      sinceMs: SINCE,
      thread: thread({
        last_message: {
          created_at: "2026-09-09T07:40:00.000Z",
          parts: [{ toolName: "table_write", type: "tool-call" }],
          role: "assistant",
        },
      }),
    });
    expect(toolOnly.last_message).toBeNull();
  });

  it("counts a run finished since the cursor as done", () => {
    const state = resolveSpaceHomeThreadState({
      nowMs: NOW,
      runs: [
        run({
          finished_at: "2026-09-09T07:00:00.000Z",
          status: "completed",
        }),
      ],
      sinceMs: SINCE,
      thread: thread(),
    });
    expect(state.state).toBe("done");
  });

  it("drops a run that finished before the cursor — that is not news", () => {
    const state = resolveSpaceHomeThreadState({
      nowMs: NOW,
      runs: [
        run({
          finished_at: "2026-09-09T05:00:00.000Z",
          status: "completed",
        }),
      ],
      sinceMs: SINCE,
      thread: thread(),
    });
    expect(state.state).toBe("quiet");
    expect(state.jobs).toEqual([]);
  });
});

describe("resolveSpaceHomeThreadState — stale parked runs", () => {
  it("stops waiting once something later in the thread finished", () => {
    // `requires_action` is how a suspended run ENDS and is never cleared, so a
    // day-old ask nobody can answer kept the card at the top of the page.
    const state = resolveSpaceHomeThreadState({
      nowMs: NOW,
      runs: [
        run({
          finished_at: "2026-09-09T07:30:00.000Z",
          id: "newer",
          started_at: "2026-09-09T07:20:00.000Z",
          status: "completed",
        }),
        run({
          finished_at: "2026-09-08T09:00:00.000Z",
          id: "older",
          started_at: "2026-09-08T08:00:00.000Z",
          status: "requires_action",
        }),
      ],
      sinceMs: SINCE,
      thread: thread(),
    });
    expect(state.jobs.some((job) => job.state === "waiting")).toBe(false);
    expect(state.state).toBe("done");
  });

  it("still waits when the ask is the newest thing there", () => {
    const state = resolveSpaceHomeThreadState({
      nowMs: NOW,
      runs: [
        run({ id: "ask", status: "requires_action" }),
        run({
          finished_at: "2026-09-09T06:30:00.000Z",
          id: "older",
          started_at: "2026-09-09T06:00:00.000Z",
          status: "completed",
        }),
      ],
      sinceMs: SINCE,
      thread: thread(),
    });
    expect(state.state).toBe("waiting");
  });
});

describe("resolveSpaceHomeThreadState — App releases", () => {
  const release = {
    app_id: "app-1",
    artifact_id: "art-1",
    name: "Reiseabrechnung",
    version: 4,
  };

  it("waits on an App that is built and not yet activated", () => {
    const state = resolveSpaceHomeThreadState({
      nowMs: NOW,
      runs: [],
      sinceMs: SINCE,
      thread: thread({ app_releases: [release] }),
    });
    expect(state.state).toBe("waiting");
    expect(state.jobs[0]?.app_release).toEqual(release);
  });

  it("replaces the parked run's generic waiting row", () => {
    // The run that built the App is `requires_action` too. Two rows would ask
    // the same question twice, and the vaguer one would win the top slot.
    const state = resolveSpaceHomeThreadState({
      nowMs: NOW,
      runs: [run({ status: "requires_action" })],
      sinceMs: SINCE,
      thread: thread({ app_releases: [release] }),
    });
    const waiting = state.jobs.filter((job) => job.state === "waiting");
    expect(waiting).toHaveLength(1);
    expect(waiting[0]?.app_release?.version).toBe(4);
  });

  it("keeps an open interrupt beside it — two things, two rows", () => {
    const state = resolveSpaceHomeThreadState({
      nowMs: NOW,
      runs: [],
      sinceMs: SINCE,
      thread: thread({ app_releases: [release], metadata: openInterrupt() }),
    });
    expect(state.jobs.map((job) => Boolean(job.app_release))).toEqual([
      true,
      false,
    ]);
  });
});

describe("resolveSpaceHomeStates", () => {
  it("keeps quiet threads in the answer — pinning is the client's call", () => {
    const states = resolveSpaceHomeStates({
      nowMs: NOW,
      runsByThread: new Map([["t2", [run({ id: "r2", thread_id: "t2" })]]]),
      sinceMs: SINCE,
      threads: [thread(), thread({ id: "t2" })],
    });
    expect(states.map((state) => state.state)).toEqual(["quiet", "running"]);
  });
});

describe("markdownToExcerptText", () => {
  it("keeps the words and drops the emphasis around them", () => {
    expect(
      markdownToExcerptText(
        '**Gebaut:** Version 4 der App „Reiseabrechnung" ist gebaut.'
      )
    ).toBe('Gebaut: Version 4 der App „Reiseabrechnung" ist gebaut.');
  });

  it("unwraps links, images and inline code to their text", () => {
    expect(
      markdownToExcerptText(
        "See [the artifact](https://x/y) and run `pnpm build` ![chart](z.png)"
      )
    ).toBe("See the artifact and run pnpm build chart");
  });

  it("drops headings, quotes and bullets at the start of a line", () => {
    expect(markdownToExcerptText("## Ergebnis\n> zitat\n- eins\n2. zwei")).toBe(
      "Ergebnis\nzitat\neins\nzwei"
    );
  });

  it("drops a fenced code block whole", () => {
    expect(
      markdownToExcerptText("Vorher\n```ts\nconst a = 1;\n```\nNachher")
    ).toBe("Vorher\n \nNachher");
  });

  it("leaves snake_case alone", () => {
    expect(markdownToExcerptText("ran agent_run_store twice")).toBe(
      "ran agent_run_store twice"
    );
  });

  it("removes an asterisk run nobody closed", () => {
    expect(markdownToExcerptText("**Was die App kann")).toBe(
      "Was die App kann"
    );
  });
});
