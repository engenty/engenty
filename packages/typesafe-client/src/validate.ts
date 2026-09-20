import type { Answer, ChoiceAnswer } from "./types.js";

/** Probabilities are calibrated and must sum to one, within rounding. */
const SUM_TOLERANCE = 0.02;

function isUnitNumber(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}

/**
 * A choice answer the caller may act on. Rejects anything that does not
 * name one of the offered ids, carries a distribution over exactly those
 * ids, sums to one, and puts the chosen id at the top — so a malformed or
 * truncated response can never become an action. Ported from jev-ultrafast
 * `validate_choice`.
 */
export function validateChoiceAnswer(
  answer: Answer | undefined,
  ids: Iterable<string>
): ChoiceAnswer {
  const offered = new Set(ids);
  const invalid = (): never => {
    throw new Error(
      "typesafe_invalid_choice: answer does not fit the question"
    );
  };
  if (answer?.type !== "choice") {
    return invalid();
  }
  const { choice, confidence, probabilities } = answer;
  if (
    typeof choice !== "string" ||
    !offered.has(choice) ||
    typeof probabilities !== "object" ||
    probabilities === null ||
    !isUnitNumber(confidence)
  ) {
    return invalid();
  }
  const keys = Object.keys(probabilities);
  if (keys.length !== offered.size || !keys.every((k) => offered.has(k))) {
    return invalid();
  }
  let sum = 0;
  let max = 0;
  for (const key of keys) {
    const p = probabilities[key];
    if (!isUnitNumber(p)) {
      return invalid();
    }
    sum += p;
    max = Math.max(max, p);
  }
  if (Math.abs(sum - 1) >= SUM_TOLERANCE) {
    return invalid();
  }
  if ((probabilities[choice] ?? 0) < max - 1e-6) {
    return invalid();
  }
  return answer;
}
