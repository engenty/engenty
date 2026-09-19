const INTERACTIVE_SELECTOR =
  "button, a, input, textarea, select, [role='menuitem'], [role='option']";

/** True when a pointer-down on the window title bar should start a move drag. */
export function isCopilotWindowMoveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  if (!target.closest("[data-copilot-window-titlebar]")) {
    return false;
  }
  return target.closest(INTERACTIVE_SELECTOR) == null;
}
