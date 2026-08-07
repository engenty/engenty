import { AGENT_UI_DOM_REGION } from "@engenty/ag-ui-bridge";

/** Stable DOM marker for agent field targets (guides, focus helpers). */
export const AGENT_UI_FIELD_ATTR = "data-agent-ui-field";

export function agentUiFieldSelector(fieldId: string): string {
  return `[${AGENT_UI_FIELD_ATTR}="${CSS.escape(fieldId)}"]`;
}

/**
 * Form-control name derived from an agent field id (`contacts.legal_name` → `legal_name`).
 */
export function agentUiFieldFormName(fieldId: string): string {
  const trimmed = fieldId.trim();
  const dot = trimmed.lastIndexOf(".");
  return dot >= 0 ? trimmed.slice(dot + 1) : trimmed;
}

function isInsideCopilotChrome(el: Element): boolean {
  const mainSelector = `[data-engenty-region="${AGENT_UI_DOM_REGION.main}"]`;
  if (el.closest(mainSelector)) {
    return false;
  }
  // Floating / docked copilot often portals to body without a region attr.
  if (el.closest("[data-engenty-copilot], [data-slot='copilot-composer']")) {
    return true;
  }
  // Heuristic: product composer placeholders (DE/EN).
  if (el instanceof HTMLElement) {
    const placeholder = el.getAttribute("placeholder") ?? "";
    if (/Nachricht eingeben|Message/i.test(placeholder)) {
      return true;
    }
  }
  // Outside `main` (when main exists) → not a page field target.
  return Boolean(document.querySelector(mainSelector));
}

/**
 * Resolve a registered agent field id to a live control without relying on
 * `document.activeElement` (which often still points at the copilot composer
 * when focus handlers use async react-hook-form `setFocus`).
 */
export function queryAgentUiFieldElement(fieldId: string): HTMLElement | null {
  const trimmed = fieldId.trim();
  if (!trimmed) {
    return null;
  }

  const byAttr = document.querySelector(agentUiFieldSelector(trimmed));
  if (byAttr instanceof HTMLElement && !isInsideCopilotChrome(byAttr)) {
    return byAttr;
  }

  const formName = agentUiFieldFormName(trimmed);
  if (!formName) {
    return null;
  }

  const main = document.querySelector(
    `[data-engenty-region="${AGENT_UI_DOM_REGION.main}"]`
  );
  const root: ParentNode = main ?? document;
  const named = root.querySelectorAll(
    `input[name="${CSS.escape(formName)}"], textarea[name="${CSS.escape(formName)}"], select[name="${CSS.escape(formName)}"]`
  );
  for (const el of named) {
    if (el instanceof HTMLElement && !isInsideCopilotChrome(el)) {
      return el;
    }
  }

  return null;
}

/**
 * Accept an activeElement only when it is a plausible page field for this id.
 */
export function isPlausibleAgentUiFieldActiveElement(
  fieldId: string,
  active: Element | null
): active is HTMLElement {
  if (!(active instanceof HTMLElement)) {
    return false;
  }
  if (isInsideCopilotChrome(active)) {
    return false;
  }
  const attr = active.getAttribute(AGENT_UI_FIELD_ATTR);
  if (attr === fieldId.trim()) {
    return true;
  }
  const formName = agentUiFieldFormName(fieldId);
  if (formName && active.getAttribute("name") === formName) {
    return true;
  }
  return false;
}
