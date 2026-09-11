import type { CopilotDockMode } from "../types/copilot-shell";

/**
 * Visual occupancy of the copilot shell slot.
 *
 * Full-page chat unmounts the drawer layer but must not flip persisted
 * `copilot.layout.open`. The layout still has to collapse the empty sidebar
 * column (and bottom-dock padding) while that page owns the surface.
 */
export function isCopilotShellSlotOpen(input: {
  chromeHidden: boolean;
  open: boolean;
}): boolean {
  return input.open && !input.chromeHidden;
}

/** Inline right-hand copilot column — never reserved on a dedicated chat page. */
export function shouldShowInlineCopilotSidebar(input: {
  chromeHidden: boolean;
  dockMode: CopilotDockMode;
}): boolean {
  return input.dockMode === "sidebar" && !input.chromeHidden;
}
