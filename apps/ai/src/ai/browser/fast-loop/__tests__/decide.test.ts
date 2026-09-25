import type {
  ClassifierClient,
  SystemOneResponse,
} from "@engenty/typesafe-client";
import { describe, expect, it, vi } from "vitest";

import { decide, tiebreak } from "../decide.js";
import type { PageSnapshot } from "../snapshot.js";

const page: PageSnapshot = {
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
  fingerprint: "f",
  guards: {},
  h: 800,
  marker: [],
  omitted_actions: 0,
  page_key: [],
  scroll: { height: 800, y: 0 },
  text: "Sign in",
  title: "Login",
  url: "https://example.test/login",
  w: 1200,
};

function clientAnswering(
  answers: SystemOneResponse["answers"]
): ClassifierClient {
  return {
    systemOne: vi.fn(async () => ({
      answers,
      model: "jev-1.13.0",
      usage: { input_tokens: 321, output_tokens: 0 },
    })),
  } as unknown as ClassifierClient;
}

const operation = (probabilities: Record<string, number>) => {
  const [choice, confidence] = Object.entries(probabilities).sort(
    (a, b) => b[1] - a[1]
  )[0] as [string, number];
  return { choice, confidence, probabilities, type: "choice" as const };
};

describe("decide", () => {
  it("maps ACT + target back to the observed action, with the element's own operation", async () => {
    const client = clientAnswering({
      operation: operation({ ACT: 0.9, BLOCKED: 0, DONE: 0, WAIT: 0.1 }),
      target: {
        choice: "2",
        confidence: 0.95,
        probabilities: { "1": 0.05, "2": 0.95 },
        type: "choice",
      },
    });
    const decision = await decide({
      client,
      goal: "sign in",
      history: [],
      page,
    });
    expect(decision.choice).toBe("e3");
    expect(decision.operation).toBe("CLICK");
    expect(decision.target).toBe("2");
    expect(decision.probability).toBe(0.95);
    // Best 0.9 × 0.95 = 0.855; runner-up WAIT 0.1.
    expect(decision.margin).toBeCloseTo(0.755, 5);
    expect(decision.runnerUp).toMatchObject({
      choice: "wait",
      operation: "WAIT",
      target: null,
    });
    expect(decision.usage?.input_tokens).toBe(321);
    const body = (client.systemOne as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as {
      state: { page: { url: string }; elements: unknown[] };
      questions: Record<string, unknown>;
    };
    expect(body.state.page.url).toBe(page.url);
    expect(body.state.elements).toHaveLength(2);
    expect(Object.keys(body.questions).sort()).toEqual(["operation", "target"]);
  });

  it("names a field target TYPE_TEXT and exposes the runner-up element", async () => {
    const client = clientAnswering({
      operation: operation({ ACT: 0.8, BLOCKED: 0.02, DONE: 0.08, WAIT: 0.1 }),
      target: {
        choice: "1",
        confidence: 0.55,
        probabilities: { "1": 0.55, "2": 0.45 },
        type: "choice",
      },
    });
    const decision = await decide({ client, goal: "x", history: [], page });
    expect(decision.operation).toBe("TYPE_TEXT");
    expect(decision.choice).toBe("e1");
    // 0.8 × 0.55 = 0.44 against 0.8 × 0.45 = 0.36.
    expect(decision.margin).toBeCloseTo(0.08, 5);
    expect(decision.runnerUp).toMatchObject({
      choice: "e3",
      label: "Sign in",
      operation: "CLICK",
      target: "2",
    });
  });

  it("ignores a malformed target head when a control wins", async () => {
    const client = clientAnswering({
      operation: operation({ ACT: 0.2, BLOCKED: 0, DONE: 0, WAIT: 0.8 }),
      target: {
        choice: "nonsense",
        confidence: 2,
        probabilities: {},
        type: "choice",
      },
    });
    const decision = await decide({ client, goal: "x", history: [], page });
    expect(decision.choice).toBe("wait");
    expect(decision.target).toBeNull();
    // ACT dropped from the ranking: the runner-up is the next control.
    expect(decision.runnerUp?.operation).not.toBe("ACT");
  });

  it("refuses an operation that was not offered", async () => {
    const client = clientAnswering({
      operation: operation({ SELECT: 1 }),
    });
    await expect(
      decide({ client, goal: "x", history: [], page })
    ).rejects.toThrow(/typesafe_invalid_choice/);
  });

  it("refuses ACT when the target head is missing", async () => {
    const client = clientAnswering({
      operation: operation({ ACT: 1, BLOCKED: 0, DONE: 0, WAIT: 0 }),
    });
    await expect(
      decide({ client, goal: "x", history: [], page })
    ).rejects.toThrow(/typesafe_invalid_choice/);
  });
});

describe("tiebreak", () => {
  const decision = async () =>
    decide({
      client: clientAnswering({
        operation: operation({ ACT: 0.9, BLOCKED: 0, DONE: 0, WAIT: 0.1 }),
        target: {
          choice: "1",
          confidence: 0.51,
          probabilities: { "1": 0.51, "2": 0.49 },
          type: "choice",
        },
      }),
      goal: "x",
      history: [],
      page,
    });

  const answering = (probabilities: Record<string, number>) => {
    const client = clientAnswering({ tiebreak: operation(probabilities) });
    return client;
  };

  it("asks one three-way question naming both steps and NEITHER", async () => {
    const client = answering({ NEITHER: 0.1, best: 0.75, runner_up: 0.15 });
    const verdict = await tiebreak({
      client,
      decision: await decision(),
      goal: "x",
      history: [],
      page,
    });
    expect(verdict.winner).toBe("best");
    expect(verdict.probability).toBe(0.75);
    const body = (client.systemOne as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as {
      questions: { tiebreak: { criteria: Record<string, unknown> } };
    };
    expect(Object.keys(body.questions.tiebreak.criteria).sort()).toEqual([
      "NEITHER",
      "best",
      "runner_up",
    ]);
    expect(JSON.stringify(body.questions.tiebreak.criteria.best)).toContain(
      "TYPE_TEXT → [1] Email"
    );
    expect(
      JSON.stringify(body.questions.tiebreak.criteria.runner_up)
    ).toContain("CLICK → [2] Sign in");
  });

  it("lets the runner-up win outright", async () => {
    const verdict = await tiebreak({
      client: answering({ NEITHER: 0.05, best: 0.25, runner_up: 0.7 }),
      decision: await decision(),
      goal: "x",
      history: [],
      page,
    });
    expect(verdict.winner).toBe("runner_up");
  });

  it("settles nothing on NEITHER or on a winner below the floor", async () => {
    expect(
      (
        await tiebreak({
          client: answering({ NEITHER: 0.6, best: 0.2, runner_up: 0.2 }),
          decision: await decision(),
          goal: "x",
          history: [],
          page,
        })
      ).winner
    ).toBeNull();
    expect(
      (
        await tiebreak({
          client: answering({ NEITHER: 0.1, best: 0.5, runner_up: 0.4 }),
          decision: await decision(),
          goal: "x",
          history: [],
          page,
        })
      ).winner
    ).toBeNull();
  });
});
