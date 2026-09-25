// One classifier call per step: what to do (act / scroll / wait / done /
// blocked) and — speculatively, in the same call — which element. The
// answer is validated against exactly the ids that were offered before
// anything may execute (D8). A close call gets one tiebreak question before
// the planner is asked.

import {
  type ChoiceAnswer,
  type ClassifierClient,
  type JsonValue,
  type SystemOneResponse,
  type SystemOneUsage,
  validateChoiceAnswer,
} from "@engenty/typesafe-client";

import {
  ACT,
  type ActionSpace,
  buildActionSpace,
  buildQuestions,
  describeTarget,
  operationOf,
  TARGET_HEAD,
} from "./action-space.js";
import { NEXT_ACTION, TIEBREAK } from "./instructions.js";
import type { PageSnapshot, SnapshotAction } from "./snapshot.js";

export interface HistoryEntry {
  action: string;
  confidence: number;
  kind: SnapshotAction["kind"] | "control";
  latency_ms: number;
  operation: string;
  page_changed: boolean | null;
  probability: number;
  step: number;
  target: string | null;
  text: string | null;
  text_latency_ms: number;
  url: string;
  usage: SystemOneUsage | null;
  /** What the acted-on field showed on the next observation; null for controls. */
  value_after: string | null;
}

/** One (operation, target) pair the call scored — or a control alone. */
export interface ScoredStep {
  /** The observed action to execute, or the control's id (DONE, BLOCKED, …). */
  choice: string;
  joint: number;
  /** The element's label, or the control's. */
  label: string;
  operation: string;
  /** Probability mass on the target within its head (1 for a control). */
  probability: number;
  target: string | null;
}

export interface Decision {
  /** The observed action to execute, or DONE/BLOCKED. */
  choice: string;
  confidence: number;
  latency_ms: number;
  /**
   * How clearly the classifier preferred this step: the gap between the
   * best and the second-best JOINT probability P(operation) × P(target)
   * over every step the call scored (a control such as DONE counts with
   * P(operation) alone). The loop gates on this rather than on absolute
   * confidence: with a dozen look-alike fields the right target may hold
   * 0.4 of the mass and still be the unambiguous winner.
   */
  margin: number;
  model: string;
  operation: string;
  operationProbabilities: Record<string, number>;
  /** Probability mass on the executed choice (target if any, else operation). */
  probability: number;
  /** The second-ranked step, for the tiebreak and for the planner's note. */
  runnerUp: ScoredStep | null;
  target: string | null;
  targetConfidence: number | null;
  usage: SystemOneUsage | null;
}

/**
 * Every step the call scored, best first: ACT × each target, plus each
 * control on its own. The target head must validate when ACT is the argmax
 * (a protocol failure otherwise); an invalid target head under a losing ACT
 * simply drops ACT from the ranking.
 */
export function scoreSteps(
  operationAnswer: ChoiceAnswer,
  answers: SystemOneResponse["answers"],
  space: ActionSpace
): { ranked: ScoredStep[]; targetAnswer: ChoiceAnswer | null } {
  const scored: ScoredStep[] = [];
  let targetAnswer: ChoiceAnswer | null = null;
  for (const [operation, pOperation] of Object.entries(
    operationAnswer.probabilities
  )) {
    if (operation !== ACT) {
      const control = space.controls[operation];
      scored.push({
        choice: control ? control.id : operation,
        joint: pOperation,
        label: control ? control.label : operation,
        operation,
        probability: 1,
        target: null,
      });
      continue;
    }
    try {
      targetAnswer = validateChoiceAnswer(
        answers[TARGET_HEAD],
        Object.keys(space.targets)
      );
    } catch (error) {
      if (operation === operationAnswer.choice) {
        throw error;
      }
      continue;
    }
    for (const [target, pTarget] of Object.entries(
      targetAnswer.probabilities
    )) {
      const action = space.targets[target] as SnapshotAction;
      scored.push({
        choice: action.id,
        joint: pOperation * pTarget,
        label: action.label,
        operation: operationOf(action) ?? "CLICK",
        probability: pTarget,
        target,
      });
    }
  }
  return {
    ranked: scored.sort((a, b) => b.joint - a.joint),
    targetAnswer,
  };
}

export interface DecideInput {
  client: ClassifierClient;
  goal: string;
  history: readonly HistoryEntry[];
  model?: string;
  page: PageSnapshot;
  space?: ActionSpace;
}

function stateFor(input: {
  history: readonly HistoryEntry[];
  page: PageSnapshot;
  space: ActionSpace;
}): Record<string, JsonValue> {
  return {
    elements: input.space.elements as unknown as JsonValue,
    page: {
      text: input.page.text,
      title: input.page.title,
      url: input.page.url,
    },
    recent_actions: input.history.slice(-10).map((h) => ({
      action: h.action,
      kind: h.kind,
      page_changed: h.page_changed,
      text: h.text,
      value_after: h.value_after,
    })),
  };
}

/** Ask, validate, and map back to an observed action. */
export async function decide(input: DecideInput): Promise<Decision> {
  const space = input.space ?? buildActionSpace(input.page.actions);
  const { operations, questions } = buildQuestions(space, input.goal);
  const startedAt = performance.now();
  const result = await input.client.systemOne({
    ...(input.model ? { model: input.model } : {}),
    questions,
    state: stateFor({ history: input.history, page: input.page, space }),
  });
  const latency_ms = Math.round(performance.now() - startedAt);
  const operationAnswer = validateChoiceAnswer(
    result.answers.operation,
    Object.keys(operations)
  );
  const { ranked, targetAnswer } = scoreSteps(
    operationAnswer,
    result.answers,
    space
  );
  const best = ranked[0];
  if (!best) {
    throw new Error("typesafe_invalid_choice: no scored step");
  }
  const runnerUp = ranked[1] ?? null;
  return {
    choice: best.choice,
    confidence: operationAnswer.confidence,
    latency_ms,
    margin: best.joint - (runnerUp?.joint ?? 0),
    model: result.model,
    operation: best.operation,
    operationProbabilities: operationAnswer.probabilities,
    probability:
      best.target === null
        ? (operationAnswer.probabilities[best.operation] ?? 0)
        : best.probability,
    runnerUp,
    target: best.target,
    targetConfidence:
      best.target === null ? null : (targetAnswer?.confidence ?? null),
    usage: result.usage ?? null,
  };
}

/** A tiebreak winner must hold at least this much of the three-way mass. */
export const TIEBREAK_MIN_PROBABILITY = 0.6;

export interface Tiebreak {
  latency_ms: number;
  /** P(winner) on the tiebreak head. */
  probability: number;
  usage: SystemOneUsage | null;
  /** Which step won, or null when NEITHER led or nothing was sure enough. */
  winner: "best" | "runner_up" | null;
}

export interface TiebreakInput extends DecideInput {
  decision: Decision;
}

/** A step as the tiebreak describes it: fuller than the target criterion. */
function describeStep(
  step: { operation: string; target: string | null; label: string },
  space: ActionSpace
): Record<string, JsonValue> {
  if (step.target !== null) {
    const action = space.targets[step.target];
    if (action) {
      return {
        ...describeTarget(step.target, action),
        step: `${step.operation} → [${step.target}] ${action.label}`,
      };
    }
  }
  return { step: step.operation, what: step.label };
}

/**
 * One more question when the best two steps are too close: this one or that
 * one, or neither. Forced binary choices renormalise to 1, so NEITHER is
 * what keeps an unsure classifier honest, and the winner must clear
 * `TIEBREAK_MIN_PROBABILITY`. Never chained; the planner is the backstop.
 */
export async function tiebreak(input: TiebreakInput): Promise<Tiebreak> {
  const { decision } = input;
  if (!decision.runnerUp) {
    return { latency_ms: 0, probability: 0, usage: null, winner: null };
  }
  const space = input.space ?? buildActionSpace(input.page.actions);
  const best = {
    label: decision.target
      ? (space.targets[decision.target]?.label ?? decision.choice)
      : (space.controls[decision.operation]?.label ?? decision.operation),
    operation: decision.operation,
    target: decision.target,
  };
  const startedAt = performance.now();
  const result = await input.client.systemOne({
    ...(input.model ? { model: input.model } : {}),
    questions: {
      tiebreak: {
        criteria: {
          NEITHER: "Neither step is the right next step for the goal.",
          best: describeStep(best, space),
          runner_up: describeStep(decision.runnerUp, space),
        },
        instructions: { goal: input.goal, rules: [NEXT_ACTION, TIEBREAK] },
        type: "choice",
      },
    },
    state: stateFor({ history: input.history, page: input.page, space }),
  });
  const latency_ms = Math.round(performance.now() - startedAt);
  const answer = validateChoiceAnswer(result.answers.tiebreak, [
    "NEITHER",
    "best",
    "runner_up",
  ]);
  const probability = answer.probabilities[answer.choice] ?? 0;
  const winner =
    answer.choice !== "NEITHER" && probability >= TIEBREAK_MIN_PROBABILITY
      ? (answer.choice as "best" | "runner_up")
      : null;
  return {
    latency_ms,
    probability,
    usage: result.usage ?? null,
    winner,
  };
}
