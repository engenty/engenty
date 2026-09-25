// The loop against a scripted page: no browser, no network. The fake page
// answers the driver's scripts by recognising which one it was handed, so
// freshness, occlusion and the text helper's contract are exercised for real.
import type {
  ClassifierClient,
  SystemOneRequest,
  SystemOneResponse,
} from "@engenty/typesafe-client";
import { describe, expect, it, vi } from "vitest";

import type { FastLoopPage } from "../driver.js";
import { runFastLoop } from "../run.js";
import {
  MARKER_SCRIPT,
  SNAPSHOT_SCRIPT,
  type SnapshotAction,
} from "../snapshot.js";
import type { FieldContext, FieldTextResult } from "../text-helper.js";

interface Scene {
  actions: SnapshotAction[];
  text: string;
  title?: string;
  url?: string;
}

/** A page whose content is a sequence of scenes; every act advances one. */
function fakePage(scenes: Scene[], options: { covered?: Set<number> } = {}) {
  let index = 0;
  const events: string[] = [];
  const raw = () => {
    const scene = scenes[Math.min(index, scenes.length - 1)] as Scene;
    return {
      actions: scene.actions,
      guards: Object.fromEntries(
        scene.actions
          .filter((a) => a.node !== undefined)
          .map((a) => [String(a.node), [a.node, index]])
      ),
      h: 800,
      marker: ["m", index],
      omitted_actions: 0,
      page_key: ["k", index],
      scroll: { height: 800, y: 0 },
      text: scene.text,
      title: scene.title ?? "Page",
      url: scene.url ?? "https://example.test/",
      w: 1200,
    };
  };
  const page: FastLoopPage = {
    evaluate: vi.fn(async (expression: string) => {
      if (expression === SNAPSHOT_SCRIPT) {
        return raw();
      }
      if (expression === MARKER_SCRIPT) {
        return raw().marker;
      }
      if (expression.includes("c.guard(c.nodes.get(")) {
        const node = Number(/nodes\.get\((\d+)\)/.exec(expression)?.[1]);
        return [raw().page_key, raw().guards[String(node)] ?? null];
      }
      if (expression.includes("elementFromPoint")) {
        const node = Number(/"node":(\d+)/.exec(expression)?.[1]);
        return options.covered?.has(node) ? null : { x: 10, y: 10 };
      }
      if (expression.includes("requestAnimationFrame")) {
        return true;
      }
      throw new Error(`unexpected script: ${expression.slice(0, 60)}`);
    }) as FastLoopPage["evaluate"],
    keyboard: {
      insertText: vi.fn(async (text: string) => {
        events.push(`insert:${text}`);
      }),
      press: vi.fn(async (key: string) => {
        events.push(`press:${key}`);
      }),
    },
    mouse: {
      click: vi.fn(async (x: number, y: number) => {
        events.push(`click:${x},${y}`);
        index += 1;
      }),
      move: vi.fn(async () => undefined),
      wheel: vi.fn(async (_dx: number, dy: number) => {
        events.push(`wheel:${dy}`);
        index += 1;
      }),
    },
    url: () => raw().url,
  };
  return { events, page };
}

type Answers = SystemOneResponse["answers"];

const choice = (id: string, ids: string[], confidence = 0.95) => ({
  choice: id,
  confidence,
  probabilities: Object.fromEntries(
    ids.map((k) => [k, k === id ? 1 - (ids.length - 1) * 0.01 : 0.01])
  ),
  type: "choice" as const,
});

/** A head whose winner barely leads the runner-up (margin `lead`). */
const closeCall = (id: string, ids: string[], lead: number) => {
  const others = ids.filter((k) => k !== id);
  const runnerUp = others[0];
  const rest = others.slice(1);
  const top = (1 + lead - rest.length * 0.01) / 2;
  const second = top - lead;
  return {
    choice: id,
    confidence: top,
    probabilities: Object.fromEntries(
      ids.map((k) => [k, k === id ? top : k === runnerUp ? second : 0.01])
    ),
    type: "choice" as const,
  };
};

/** ACT clearly, then the given target head. */
const act = (offered: string[], target: Answers["target"]) => ({
  operation: choice("ACT", offered),
  target,
});

/**
 * Answers in order for decision calls; a tiebreak call is answered by
 * `onTiebreak` (default: NEITHER wins).
 */
function scriptedClient(
  steps: ((offered: string[]) => Answers)[],
  onTiebreak: () => Answers = () => ({
    tiebreak: choice("NEITHER", ["NEITHER", "best", "runner_up"]),
  })
) {
  let call = 0;
  const systemOne = vi.fn(async (request: SystemOneRequest) => {
    if (request.questions.tiebreak) {
      return {
        answers: onTiebreak(),
        model: "jev-1.13.0",
        usage: { input_tokens: 50, output_tokens: 0 },
      };
    }
    const offered = Object.keys(request.questions.operation?.criteria ?? {});
    const step = steps[Math.min(call, steps.length - 1)] as (
      o: string[]
    ) => Answers;
    call += 1;
    return {
      answers: step(offered),
      model: "jev-1.13.0",
      usage: { input_tokens: 100, output_tokens: 0 },
    };
  });
  return { client: { systemOne } as unknown as ClassifierClient, systemOne };
}

const helper = (text: string | null, latency_ms = 5) =>
  vi.fn(
    async (_ctx: FieldContext): Promise<FieldTextResult> => ({
      latency_ms,
      model: "m",
      source: "llm",
      text,
    })
  );

const login: Scene = {
  actions: [
    {
      id: "e1",
      kind: "fill",
      label: "Email",
      node: 1,
      role: "textbox",
      value: "",
    },
    {
      id: "e2",
      kind: "click",
      label: "Open Email",
      node: 1,
      role: "textbox",
      value: "",
    },
    { id: "e3", kind: "click", label: "Sign in", node: 2, role: "button" },
    { id: "wait", kind: "wait", label: "Wait for the page to update" },
  ],
  text: "Sign in with your email",
};
const loginFilled: Scene = {
  ...login,
  actions: login.actions.map((a) =>
    a.node === 1 ? { ...a, value: "ada@example.test" } : a
  ),
};
const home: Scene = {
  actions: [{ id: "wait", kind: "wait", label: "Wait for the page to update" }],
  text: "Welcome back",
  url: "https://example.test/home",
};

describe("runFastLoop", () => {
  it("types, clicks, and reports done with per-step telemetry", async () => {
    const { events, page } = fakePage([login, loginFilled, home]);
    const { client } = scriptedClient([
      (offered) => act(offered, choice("1", ["1", "2"])),
      (offered) => act(offered, choice("2", ["1", "2"])),
      (offered) => ({ operation: choice("DONE", offered) }),
    ]);
    const fieldText = helper("ada@example.test");
    const steps: number[] = [];
    const result = await runFastLoop({
      client,
      fieldText,
      goal: "sign in as ada@example.test",
      maxSteps: 10,
      minMargin: 0.1,
      onStep: (s) => steps.push(s.step),
      page,
    });
    expect(result.status).toBe("done");
    expect(result.steps).toBe(2);
    expect(steps).toEqual([1, 2]);
    expect(events).toEqual([
      "click:10,10",
      "press:Control+a",
      "insert:ada@example.test",
      "click:10,10",
    ]);
    expect(
      result.history.map((h) => [
        h.operation,
        h.action,
        h.page_changed,
        h.value_after,
      ])
    ).toEqual([
      ["TYPE_TEXT", "Email", true, "ada@example.test"],
      ["CLICK", "Sign in", true, null],
    ]);
    expect(result.page.url).toBe("https://example.test/home");
    expect(result.totals.input_tokens).toBe(300);
    // Values are asked for as soon as a page with a field is observed (login,
    // then the filled login), and read from the cache when a field is chosen.
    expect(fieldText).toHaveBeenCalledTimes(3);
    expect(fieldText.mock.calls[0]?.[0].field.label).toBe("Email");
    expect(result.totals.text_latency_ms).toBe(15);
  });

  it("stops as uncertain after a failed tiebreak, naming both steps and the way back", async () => {
    const { events, page } = fakePage([login]);
    const { client, systemOne } = scriptedClient([
      (offered) => act(offered, closeCall("2", ["1", "2"], 0.05)),
    ]);
    const result = await runFastLoop({
      client,
      fieldText: helper("x"),
      goal: "x",
      maxSteps: 10,
      minMargin: 0.1,
      page,
    });
    expect(result.status).toBe("uncertain");
    expect(result.steps).toBe(0);
    expect(events).toEqual([]);
    expect(systemOne).toHaveBeenCalledTimes(2);
    expect(result.note).toContain("CLICK → [2] Sign in");
    expect(result.note).toContain("TYPE_TEXT → [1] Email");
    expect(result.note).toMatch(/call browser_run_fast again/);
    expect(result.elements?.map((e) => e.label)).toEqual(["Email", "Sign in"]);
  });

  it("lets a tiebreak settle a close call, for the runner-up too", async () => {
    const { events, page } = fakePage([login, loginFilled, home]);
    const { client } = scriptedClient(
      [
        // Sign in barely leads Email; the tiebreak says Email.
        (offered) => act(offered, closeCall("2", ["1", "2"], 0.05)),
        (offered) => ({ operation: choice("DONE", offered) }),
      ],
      () => ({
        tiebreak: choice("runner_up", ["NEITHER", "best", "runner_up"]),
      })
    );
    const audited: { operation: string; tiebreak: number | null }[] = [];
    const result = await runFastLoop({
      client,
      fieldText: helper("ada@example.test"),
      goal: "x",
      maxSteps: 10,
      minMargin: 0.1,
      onStep: (s) =>
        audited.push({ operation: s.operation, tiebreak: s.tiebreak }),
      page,
    });
    expect(result.status).toBe("done");
    expect(events.slice(0, 3)).toEqual([
      "click:10,10",
      "press:Control+a",
      "insert:ada@example.test",
    ]);
    expect(audited[0]?.operation).toBe("TYPE_TEXT");
    expect(audited[0]?.tiebreak).toBeCloseTo(0.98, 5);
    expect(result.totals.input_tokens).toBe(250);
  });

  it("gates a control against an element by their joint mass", async () => {
    const { events, page } = fakePage([login]);
    const { client } = scriptedClient([
      (offered) => ({
        // ACT 0.5 × target 0.9 = 0.45 against DONE 0.44: too close.
        operation: {
          choice: "ACT",
          confidence: 0.5,
          probabilities: Object.fromEntries(
            offered.map((k) => [
              k,
              k === "ACT"
                ? 0.5
                : k === "DONE"
                  ? 0.44
                  : 0.06 / (offered.length - 2),
            ])
          ),
          type: "choice" as const,
        },
        target: choice("2", ["1", "2"], 0.9),
      }),
    ]);
    const result = await runFastLoop({
      client,
      fieldText: helper("x"),
      goal: "x",
      maxSteps: 10,
      minMargin: 0.1,
      page,
    });
    expect(result.status).toBe("uncertain");
    expect(result.note).toContain("DONE");
    expect(events).toEqual([]);
  });

  it("executes a low-mass target that still clearly leads the runner-up", async () => {
    const { events, page } = fakePage([login]);
    const { client } = scriptedClient([
      (offered) => ({
        operation: choice("ACT", offered, 0.9),
        // A 0.595 pick is a coin flip for an absolute gate at 0.5 on a
        // longer form; it leads the runner-up by 0.19 (times ACT's own
        // mass), so the step runs.
        target: {
          choice: "2",
          confidence: 0.595,
          probabilities: { "1": 0.405, "2": 0.595 },
          type: "choice" as const,
        },
      }),
      (offered) => ({ operation: choice("DONE", offered) }),
    ]);
    const steps: number[] = [];
    const result = await runFastLoop({
      client,
      fieldText: helper("x"),
      goal: "x",
      maxSteps: 10,
      minMargin: 0.1,
      onStep: (step) => steps.push(step.margin),
      page,
    });
    expect(result.status).toBe("done");
    expect(events.length).toBeGreaterThan(0);
    expect(steps[0]).toBeGreaterThan(0.1);
    expect(steps[0]).toBeLessThanOrEqual(0.19);
  });

  it("types nothing when the helper finds no value", async () => {
    const { events, page } = fakePage([login]);
    const { client } = scriptedClient([
      (offered) => act(offered, choice("1", ["1", "2"])),
    ]);
    const result = await runFastLoop({
      client,
      fieldText: helper(null, 1),
      goal: "sign in",
      maxSteps: 10,
      minMargin: 0.1,
      page,
    });
    expect(result.status).toBe("uncertain");
    expect(result.note).toMatch(/needs a value/);
    expect(events).toEqual([]);
  });

  it("reports a helper failure as an error only when a field is chosen", async () => {
    const failing = vi.fn(async () => {
      throw new Error("text_helper_invalid");
    });
    const { page } = fakePage([login, loginFilled, home]);
    const clicking = scriptedClient([
      (offered) => act(offered, choice("2", ["1", "2"])),
      (offered) => ({ operation: choice("DONE", offered) }),
    ]);
    const clicked = await runFastLoop({
      client: clicking.client,
      fieldText: failing,
      goal: "x",
      maxSteps: 10,
      minMargin: 0.1,
      page,
    });
    expect(clicked.status).toBe("done");
    expect(failing).toHaveBeenCalled();

    const { page: page2 } = fakePage([login]);
    const typing = scriptedClient([
      (offered) => act(offered, choice("1", ["1", "2"])),
    ]);
    const typed = await runFastLoop({
      client: typing.client,
      fieldText: failing,
      goal: "x",
      maxSteps: 10,
      minMargin: 0.1,
      page: page2,
    });
    expect(typed.status).toBe("error");
    expect(typed.note).toMatch(/text_helper_invalid/);
  });

  it("re-observes on a covered target instead of clicking, then gives up", async () => {
    const { events, page } = fakePage([login], { covered: new Set([2]) });
    const { client, systemOne } = scriptedClient([
      (offered) => act(offered, choice("2", ["1", "2"])),
    ]);
    const result = await runFastLoop({
      client,
      fieldText: helper("x"),
      goal: "x",
      maxSteps: 10,
      minMargin: 0.1,
      page,
    });
    expect(result.status).toBe("error");
    expect(result.note).toMatch(/covered/);
    expect(events).toEqual([]);
    // One decision per stale retry, bounded.
    expect(systemOne).toHaveBeenCalledTimes(4);
  });

  it("stops when the seat is gone", async () => {
    const { events, page } = fakePage([login]);
    const { client, systemOne } = scriptedClient([
      (offered) => ({ operation: choice("DONE", offered) }),
    ]);
    const result = await runFastLoop({
      client,
      fieldText: helper("x"),
      goal: "x",
      maxSteps: 10,
      minMargin: 0.1,
      page,
      shouldStop: () => true,
    });
    expect(result.status).toBe("interrupted");
    expect(systemOne).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it("calls three unchanged pages blocked and the step budget budget", async () => {
    const still: Scene = {
      actions: [
        { id: "e1", kind: "click", label: "Nothing", node: 1, role: "button" },
      ],
      text: "same",
    };
    // Clicks advance the scene index, but every scene is identical → fingerprint unchanged.
    const { page } = fakePage([still, still, still, still, still]);
    const clicking = (offered: string[]) => act(offered, choice("1", ["1"]));
    const blocked = await runFastLoop({
      client: scriptedClient([clicking]).client,
      fieldText: helper("x"),
      goal: "x",
      maxSteps: 10,
      minMargin: 0.1,
      page,
    });
    expect(blocked.status).toBe("blocked");
    expect(blocked.steps).toBe(3);
    expect(blocked.note).toMatch(/call browser_run_fast again/);

    const { page: page2 } = fakePage([still, still, still]);
    const budget = await runFastLoop({
      client: scriptedClient([clicking]).client,
      fieldText: helper("x"),
      goal: "x",
      maxSteps: 2,
      minMargin: 0.1,
      page: page2,
    });
    expect(budget.status).toBe("budget");
    expect(budget.steps).toBe(2);
    expect(budget.note).toMatch(/browser_run_fast again/);
  });

  it("reports a classifier failure as error without acting", async () => {
    const { events, page } = fakePage([login]);
    const client = {
      systemOne: vi.fn(async () => {
        throw new Error("typesafe_http_529");
      }),
    } as unknown as ClassifierClient;
    const result = await runFastLoop({
      client,
      fieldText: helper("x"),
      goal: "x",
      maxSteps: 10,
      minMargin: 0.1,
      page,
    });
    expect(result.status).toBe("error");
    expect(result.note).toMatch(/529/);
    expect(events).toEqual([]);
  });
});
