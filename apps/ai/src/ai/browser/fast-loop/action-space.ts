// From one observation to the classifier's two questions: an `operation`
// head — act on an element, scroll, wait, done, blocked — and one `target`
// head over every element the page offers. The element's kind names the
// operation (a field is typed into, an option is selected, everything else
// is clicked), so the classifier never has to split its mass between "click
// the field" and "type into the field" for the same element (PLAN-browser-
// fast-loop.md §9.4 Q2). One round trip; the answer is validated against
// exactly the ids that were offered.

import type { ChoiceQuestion, JsonValue } from "@engenty/typesafe-client";

import { NEXT_ACTION, TARGET } from "./instructions.js";
import type { SnapshotAction } from "./snapshot.js";

/** What the classifier may pick besides an element operation. */
export const CONTROL_OPERATIONS = ["DONE", "BLOCKED"] as const;

/** The operation head's id for "interact with one element". */
export const ACT = "ACT";
/** The single target head's key in the questions and the answers. */
export const TARGET_HEAD = "target";

export type ElementOperation = "CLICK" | "TYPE_TEXT" | "SELECT";

const KIND_TO_OPERATION: Readonly<Record<string, ElementOperation>> = {
  click: "CLICK",
  fill: "TYPE_TEXT",
  select: "SELECT",
};

/** The operation an observed element action executes. */
export function operationOf(action: SnapshotAction): ElementOperation | null {
  return KIND_TO_OPERATION[action.kind] ?? null;
}

export interface ElementSummary {
  checked?: string;
  expanded?: string;
  /** `"1"`, `"2"`, … — one per distinct node, in observation order. */
  index: string;
  label: string;
  operation: ElementOperation;
  options?: { index: string; label: string; value: string }[];
  role?: string;
  selected?: string;
  value?: string;
}

export interface ActionSpace {
  /** Non-element actions by their upper-cased id: SCROLL_UP, SCROLL_DOWN, WAIT. */
  controls: Record<string, SnapshotAction>;
  elements: ElementSummary[];
  /** Target index (`"3"`, `"5:2"`) → the observed action it executes. */
  targets: Record<string, SnapshotAction>;
}

/**
 * What makes two observed elements interchangeable for the classifier: a
 * second "Search" button with the same role, label and state is the same
 * step. Only the first such node is offered.
 */
function duplicateKey(action: SnapshotAction): string {
  return JSON.stringify([
    action.kind,
    action.role ?? null,
    action.label,
    action.value ?? null,
    action.current_value ?? null,
    action.checked ?? null,
    action.selected ?? null,
    action.expanded ?? null,
  ]);
}

/**
 * One index per observed element, one operation per element. An editable
 * field's companion "Open …" click is not offered: typing into the field is
 * the step, and a picker that refuses typing is the planner's case.
 */
export function buildActionSpace(
  actions: readonly SnapshotAction[]
): ActionSpace {
  const elements: ElementSummary[] = [];
  const indices = new Map<number, string>();
  const editable = new Set<number>();
  const seen = new Set<string>();
  const targets: Record<string, SnapshotAction> = {};
  const controls: Record<string, SnapshotAction> = {};
  for (const action of actions) {
    if (action.kind === "fill" && action.node !== undefined) {
      editable.add(action.node);
    }
  }
  for (const action of actions) {
    const operation = operationOf(action);
    if (!operation || action.node === undefined) {
      controls[action.id.toUpperCase()] = action;
      continue;
    }
    if (action.kind === "click" && editable.has(action.node)) {
      continue;
    }
    if (action.kind !== "select") {
      const key = duplicateKey(action);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
    }
    let index = indices.get(action.node);
    if (!index) {
      index = String(elements.length + 1);
      indices.set(action.node, index);
      const element: ElementSummary = {
        index,
        label: action.label.split(" → ")[0] ?? action.label,
        operation,
      };
      for (const key of [
        "role",
        "value",
        "checked",
        "selected",
        "expanded",
      ] as const) {
        const value = action[key];
        if (value !== undefined) {
          element[key] = value;
        }
      }
      if (action.kind === "select") {
        element.value = action.current_value ?? "";
        element.options = [];
      }
      elements.push(element);
    }
    const element = elements[Number(index) - 1] as ElementSummary;
    let target = index;
    if (action.kind === "select") {
      if (!element.options) {
        element.options = [];
      }
      const options = element.options;
      target = `${index}:${options.length + 1}`;
      options.push({
        index: target,
        label: action.label,
        value: action.value ?? "",
      });
    }
    targets[target] = action;
  }
  return { controls, elements, targets };
}

export interface FastLoopQuestions {
  /** Every id the `operation` head may answer with. */
  operations: Record<string, string>;
  questions: Record<string, ChoiceQuestion>;
}

const ACT_LABEL =
  "Interact with one visible element: click a button, link, option, suggestion or calendar day; enter text in a field (a small helper supplies the value from the goal); or choose a dropdown value. The target question names the element.";

/** One criterion per target: the element as the classifier compares it. */
export function describeTarget(
  index: string,
  action: SnapshotAction
): Record<string, JsonValue> {
  const entry: Record<string, JsonValue> = {
    current_value: action.current_value ?? action.value ?? "",
    element: `[${index}] ${action.label}`,
    operation: operationOf(action) ?? "CLICK",
  };
  for (const key of ["role", "checked", "selected", "expanded"] as const) {
    const value = action[key];
    if (value !== undefined) {
      entry[key] = value;
    }
  }
  return entry;
}

/** The operation head plus, when the page offers any element, the target head. */
export function buildQuestions(
  space: ActionSpace,
  goal: string
): FastLoopQuestions {
  const operations: Record<string, string> = {};
  const targetIds = Object.keys(space.targets);
  if (targetIds.length > 0) {
    operations[ACT] = ACT_LABEL;
  }
  for (const [id, action] of Object.entries(space.controls)) {
    operations[id] = action.label;
  }
  operations.DONE = "Every requirement is visibly satisfied.";
  operations.BLOCKED =
    "No offered element can advance the goal (an offered confirmation or submit button means not blocked).";

  const questions: Record<string, ChoiceQuestion> = {
    operation: {
      criteria: operations,
      instructions: { goal, rules: NEXT_ACTION },
      type: "choice",
    },
  };
  if (targetIds.length > 0) {
    const criteria: Record<string, JsonValue> = {};
    for (const [index, action] of Object.entries(space.targets)) {
      criteria[index] = describeTarget(index, action);
    }
    questions[TARGET_HEAD] = {
      criteria,
      instructions: { goal, rules: [NEXT_ACTION, TARGET] },
      type: "choice",
    };
  }
  return { operations, questions };
}
