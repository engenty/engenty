// The loop: observe → decide → (text) → act → observe, until DONE, BLOCKED,
// the step budget, an ambiguous step (the planner LLM takes over), or
// the seat is gone. Ported from jev-ultrafast `agent.py` `Agent.command`.

import type { SystemOneUsage, TypeSafeClient } from "@engenty/typesafe-client";

import { buildActionSpace, type ElementSummary } from "./action-space.js";
import {
  type Decision,
  decide,
  type HistoryEntry,
  tiebreak,
} from "./decide.js";
import { FastLoopDriver, type FastLoopPage, StalePageError } from "./driver.js";
import type { PageSnapshot, SnapshotAction } from "./snapshot.js";
import {
  buildFieldContext,
  type FieldTextFn,
  type FieldTextResult,
} from "./text-helper.js";

export type FastLoopStatus =
  | "done"
  | "blocked"
  | "uncertain"
  | "budget"
  | "interrupted"
  | "error";

export interface FastLoopStep {
  confidence: number;
  latency_ms: number;
  margin: number;
  operation: string;
  page_changed: boolean | null;
  probability: number;
  step: number;
  target_confidence: number | null;
  target_label: string | null;
  /** How long the step waited for its field value after the decision (the helper mostly runs alongside the classifier). */
  text_latency_ms: number;
  text_source: FieldTextResult["source"] | null;
  /** P(winner) of the tiebreak that decided this step; null when the first answer was clear. */
  tiebreak: number | null;
  usage: SystemOneUsage | null;
}

export interface FastLoopResult {
  elapsed_ms: number;
  /** Offered to the planner when the loop stops short of DONE. */
  elements: ElementSummary[] | null;
  history: HistoryEntry[];
  /** Why the loop stopped, for the planner. */
  note: string;
  page: { text: string; title: string; url: string };
  status: FastLoopStatus;
  steps: number;
  totals: {
    input_tokens: number;
    jev_latency_ms: number;
    /** Every helper call's own latency — the paid cost, not the waited one. */
    text_latency_ms: number;
  };
}

export interface RunFastLoopInput {
  client: TypeSafeClient;
  fieldText: FieldTextFn;
  goal: string;
  maxSteps: number;
  /** A step whose margin (see `Decision.margin`) is below this is not executed. */
  minMargin: number;
  model?: string;
  /** Per executed step — the audit lane. */
  onStep?: (step: FastLoopStep) => void;
  page: FastLoopPage;
  /** Polled before every step: true = stop now (seat taken, run cancelled). */
  shouldStop?: () => boolean;
}

/** How much page text the planner gets back. */
const RESULT_TEXT_CHARS = 1500;
/** Three consecutive non-wait steps that changed nothing = stuck. */
const STUCK_WINDOW = 3;
/**
 * A stale or covered target is re-observed after the page settles; each
 * retry re-asks the classifier on the fresh observation.
 */
const STALE_RETRIES_PER_STEP = 3;

/** Every note that stops short of DONE ends with the way back. */
const RESUME =
  "Do that one step with the browser_* tools, then call browser_run_fast again with the same goal.";

function describe(step: {
  operation: string;
  target: string | null;
  label: string;
}): string {
  return step.target === null
    ? step.operation
    : `${step.operation} → [${step.target}] ${step.label}`;
}

/** What the acted-on element shows after the step, for the history. */
function valueAfter(page: PageSnapshot, action: SnapshotAction): string | null {
  if (action.node === undefined) {
    return null;
  }
  const now = page.actions.find(
    (a) => a.node === action.node && a.kind === action.kind
  );
  if (!now) {
    return null;
  }
  if (action.kind === "fill") {
    return now.value ?? null;
  }
  if (action.kind === "select") {
    return now.current_value ?? null;
  }
  return now.checked ?? null;
}

export async function runFastLoop(
  input: RunFastLoopInput
): Promise<FastLoopResult> {
  const driver = new FastLoopDriver(input.page);
  const history: HistoryEntry[] = [];
  const startedAt = performance.now();
  const totals = { input_tokens: 0, jev_latency_ms: 0, text_latency_ms: 0 };
  let page: PageSnapshot = await driver.observe();

  // The helper runs alongside the classifier: as soon as a page with a
  // typeable field is observed, its values are asked for, so a TYPE_TEXT
  // decision finds them ready (one call per page, cached per field).
  const prefetch: {
    current: { fingerprint: string; promise: Promise<void> } | null;
  } = { current: null };
  const prefetchText = (snapshot: PageSnapshot) => {
    if (prefetch.current?.fingerprint === snapshot.fingerprint) {
      return;
    }
    const field = snapshot.actions.find((a) => a.kind === "fill");
    if (!field) {
      prefetch.current = null;
      return;
    }
    const context = buildFieldContext(input.goal, field, snapshot, history);
    prefetch.current = {
      fingerprint: snapshot.fingerprint,
      promise: Promise.resolve()
        .then(() => input.fieldText(context))
        .then(
          (result) => {
            totals.text_latency_ms += result?.latency_ms ?? 0;
          },
          () => {
            // The per-field read below reports the failure if the step needs it.
          }
        ),
    };
  };
  prefetchText(page);

  const finish = (
    status: FastLoopStatus,
    note: string,
    withElements: boolean
  ): FastLoopResult => ({
    elapsed_ms: Math.round(performance.now() - startedAt),
    elements: withElements ? buildActionSpace(page.actions).elements : null,
    history,
    note,
    page: {
      text: page.text.slice(0, RESULT_TEXT_CHARS),
      title: page.title,
      url: page.url,
    },
    status,
    steps: history.length,
    totals,
  });

  let staleRetries = 0;
  while (history.length < input.maxSteps) {
    if (input.shouldStop?.()) {
      return finish(
        "interrupted",
        "The seat was taken or the run stopped; no further step ran.",
        false
      );
    }
    if (!(await driver.fresh(page))) {
      page = await driver.observe();
      prefetchText(page);
    }
    const decideInput = {
      client: input.client,
      goal: input.goal,
      history,
      ...(input.model ? { model: input.model } : {}),
      page,
    };
    let decision: Decision;
    try {
      decision = await decide(decideInput);
    } catch (error) {
      return finish(
        "error",
        `The classifier gave no usable decision: ${error instanceof Error ? error.message : String(error)}. ${RESUME}`,
        true
      );
    }
    totals.jev_latency_ms += decision.latency_ms;
    totals.input_tokens += decision.usage?.input_tokens ?? 0;

    let tiebreakProbability: number | null = null;
    if (decision.margin < input.minMargin) {
      const best = {
        label: decision.target
          ? (page.actions.find((a) => a.id === decision.choice)?.label ??
            decision.choice)
          : decision.operation,
        operation: decision.operation,
        target: decision.target,
      };
      const contest = decision.runnerUp
        ? `${describe(best)} (${(decision.runnerUp.joint + decision.margin).toFixed(2)}) and ${describe(decision.runnerUp)} (${decision.runnerUp.joint.toFixed(2)})`
        : describe(best);
      let verdict: Awaited<ReturnType<typeof tiebreak>>;
      try {
        verdict = await tiebreak({ ...decideInput, decision });
      } catch (error) {
        return finish(
          "error",
          `The tiebreak gave no usable answer: ${error instanceof Error ? error.message : String(error)}. ${RESUME}`,
          true
        );
      }
      totals.jev_latency_ms += verdict.latency_ms;
      totals.input_tokens += verdict.usage?.input_tokens ?? 0;
      if (verdict.winner === null) {
        return finish(
          "uncertain",
          `The classifier could not choose between ${contest}; a tiebreak did not settle it either (${verdict.probability.toFixed(2)}). ${RESUME}`,
          true
        );
      }
      tiebreakProbability = verdict.probability;
      if (verdict.winner === "runner_up" && decision.runnerUp) {
        const chosen = decision.runnerUp;
        decision = {
          ...decision,
          choice: chosen.choice,
          operation: chosen.operation,
          probability: chosen.probability,
          target: chosen.target,
        };
      }
    }

    if (decision.choice === "DONE" || decision.choice === "BLOCKED") {
      if (!(await driver.fresh(page))) {
        page = await driver.observe();
        prefetchText(page);
        continue;
      }
      const done = decision.choice === "DONE";
      return finish(
        done ? "done" : "blocked",
        done
          ? "The classifier saw every requirement of the goal visibly satisfied."
          : `The classifier found no supported operation that makes progress. ${RESUME} If the page itself is the obstacle, ask the person.`,
        !done
      );
    }

    const action = page.actions.find((a) => a.id === decision.choice);
    if (!action) {
      return finish(
        "error",
        `Decision named an action the page did not offer. ${RESUME}`,
        true
      );
    }

    let text: string | null = null;
    let textWait = 0;
    let textSource: FieldTextResult["source"] | null = null;
    try {
      if (action.kind === "fill") {
        if (!(await driver.fresh(page))) {
          throw new StalePageError("Page changed before text generation.");
        }
        const waitStarted = performance.now();
        if (prefetch.current?.fingerprint === page.fingerprint) {
          await prefetch.current.promise;
        }
        const context = buildFieldContext(input.goal, action, page, history);
        const result = await input.fieldText(context);
        textWait = Math.round(performance.now() - waitStarted);
        // A hit on the prefetched page reports 0; a value the prefetch did
        // not cover (another source, a changed page) reports its own call.
        totals.text_latency_ms += result.latency_ms;
        text = result.text;
        textSource = result.source;
        if (text === null) {
          return finish(
            "uncertain",
            `The field "${action.label}" needs a value the goal does not contain. Supply it in the goal and call browser_run_fast again, or ask the person.`,
            true
          );
        }
      }
      await driver.act(action, page, text);
      staleRetries = 0;
    } catch (error) {
      if (
        error instanceof StalePageError &&
        staleRetries < STALE_RETRIES_PER_STEP
      ) {
        staleRetries += 1;
        // The target moved or is covered because the page is still changing
        // (a calendar re-rendering, a dialog sliding in). Let it come to rest
        // before observing again, or the retry sees the same frame.
        await driver.settle();
        page = await driver.observe();
        prefetchText(page);
        continue;
      }
      return finish(
        "error",
        `Step failed: ${error instanceof Error ? error.message : String(error)}. ${RESUME}`,
        true
      );
    }

    const entry: HistoryEntry = {
      action: action.label,
      confidence: decision.confidence,
      kind: action.kind,
      latency_ms: decision.latency_ms,
      operation: decision.operation,
      page_changed: null,
      probability: decision.probability,
      step: history.length + 1,
      target: decision.target,
      text,
      text_latency_ms: textWait,
      url: page.url,
      usage: decision.usage,
      value_after: null,
    };
    history.push(entry);
    const before = page.fingerprint;
    page = await driver.observe();
    entry.page_changed = page.fingerprint !== before;
    entry.url = page.url;
    entry.value_after = valueAfter(page, action);
    prefetchText(page);
    input.onStep?.({
      confidence: decision.confidence,
      latency_ms: decision.latency_ms,
      margin: decision.margin,
      operation: decision.operation,
      page_changed: entry.page_changed,
      probability: decision.probability,
      step: entry.step,
      target_confidence: decision.targetConfidence,
      target_label: decision.target ? action.label : null,
      text_latency_ms: textWait,
      text_source: textSource,
      tiebreak: tiebreakProbability,
      usage: decision.usage,
    });

    const recent = history.slice(-STUCK_WINDOW);
    if (
      recent.length === STUCK_WINDOW &&
      recent.every((h) => h.page_changed === false && h.kind !== "wait")
    ) {
      return finish(
        "blocked",
        `The last ${STUCK_WINDOW} steps changed nothing on the page. ${RESUME}`,
        true
      );
    }
  }
  return finish(
    "budget",
    `Stopped at the ${input.maxSteps}-step budget for one call. Check the page, then call browser_run_fast again with the remaining goal.`,
    true
  );
}
