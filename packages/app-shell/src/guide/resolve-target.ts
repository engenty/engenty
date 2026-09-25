import { AGENT_UI_DOM_REGION_SELECTORS } from "@engenty/ag-ui-bridge";
import type { UiGuideTarget } from "./types.js";

export interface ResolveUiGuideTargetHelpers {
  getFieldElement: (fieldId: string) => HTMLElement | null;
}

function countTargetKinds(target: UiGuideTarget): number {
  let count = 0;
  if (target.field_id?.trim()) {
    count += 1;
  }
  if (target.selector?.trim()) {
    count += 1;
  }
  if (target.region?.trim()) {
    count += 1;
  }
  return count;
}

/**
 * Resolve exactly one of field_id / selector / region to a live HTMLElement.
 */
export function resolveUiGuideTarget(
  target: UiGuideTarget,
  helpers: ResolveUiGuideTargetHelpers
): HTMLElement {
  const kinds = countTargetKinds(target);
  if (kinds !== 1) {
    throw new Error(
      "target requires exactly one of field_id, selector, or region."
    );
  }

  const fieldId = target.field_id?.trim();
  if (fieldId) {
    const el = helpers.getFieldElement(fieldId);
    if (!el) {
      throw new Error(`Field target not found: ${fieldId}`);
    }
    return el;
  }

  const selector = target.selector?.trim();
  if (selector) {
    const el = document.querySelector(selector);
    if (!(el instanceof HTMLElement)) {
      throw new Error(`Selector target not found: ${selector}`);
    }
    return el;
  }

  const region = target.region?.trim();
  if (!region) {
    throw new Error(
      "target requires exactly one of field_id, selector, or region."
    );
  }

  const regionSelector =
    region in AGENT_UI_DOM_REGION_SELECTORS
      ? AGENT_UI_DOM_REGION_SELECTORS[
          region as keyof typeof AGENT_UI_DOM_REGION_SELECTORS
        ]
      : `[data-engenty-region="${CSS.escape(region)}"]`;

  const el = document.querySelector(regionSelector);
  if (!(el instanceof HTMLElement)) {
    throw new Error(`Region target not found: ${region}`);
  }
  return el;
}

export function formatUiGuideFollowUpMessage(args: {
  action_id: string;
  guide_id: string;
  input_value?: string;
  input_values?: Record<string, string>;
  /** The button's text, so the chat can show what the person clicked. */
  label?: string;
  /** The guide's title: which step the click answered. */
  title?: string;
}): string {
  const parts = [
    "[ui_guide]",
    `guide_id=${args.guide_id}`,
    `action=${args.action_id}`,
  ];
  if (args.label) {
    parts.push(`label=${JSON.stringify(args.label)}`);
  }
  if (args.title) {
    parts.push(`title=${JSON.stringify(args.title)}`);
  }
  if (args.input_value != null && args.input_value.length > 0) {
    parts.push(`input=${JSON.stringify(args.input_value)}`);
  }
  if (args.input_values) {
    for (const [key, value] of Object.entries(args.input_values)) {
      if (value.length > 0) {
        parts.push(`input.${key}=${JSON.stringify(value)}`);
      }
    }
  }
  return parts.join(" ");
}

/** What a person did in a guide, read back from its follow-up message. */
export interface UiGuideFollowUp {
  action_id: string;
  /** `input` for the single field, the field id for `input.<id>`. */
  inputs: { key: string; value: string }[];
  label: string | null;
  title: string | null;
}

const FOLLOW_UP_RE = /^\[ui_guide\] guide_id=\S+ action=(\S+)(.*)$/s;
const FOLLOW_UP_FIELD_RE =
  /\s(label|title|input(?:\.[\w-]+)?)=("(?:[^"\\]|\\.)*")/g;

/** The inverse of {@link formatUiGuideFollowUpMessage}; null for any other text. */
export function readUiGuideFollowUp(text: string): UiGuideFollowUp | null {
  const match = FOLLOW_UP_RE.exec(text.trim());
  if (!match) {
    return null;
  }
  const result: UiGuideFollowUp = {
    action_id: match[1] ?? "",
    inputs: [],
    label: null,
    title: null,
  };
  for (const [, key, quoted] of (match[2] ?? "").matchAll(FOLLOW_UP_FIELD_RE)) {
    let value: string;
    try {
      value = JSON.parse(quoted ?? '""') as string;
    } catch {
      continue;
    }
    if (key === "label") {
      result.label = value;
    } else if (key === "title") {
      result.title = value;
    } else if (key) {
      result.inputs.push({
        key: key === "input" ? "input" : key.slice("input.".length),
        value,
      });
    }
  }
  return result;
}
