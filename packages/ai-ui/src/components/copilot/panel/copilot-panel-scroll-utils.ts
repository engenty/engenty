import type { CopilotEmptyLandingAlign } from "./copilot-panel-content-types";

export type { CopilotEmptyLandingAlign } from "./copilot-panel-content-types";

/**
 * Visual-only classes for the bottom-dock composer card (border, bg, shadow,
 * backdrop-blur). Rounding and padding are intentionally omitted so that the
 * shell's `isMultiline` logic can apply them exclusively without class
 * conflicts that would produce a flash-of-wrong-style on mount.
 */
export const COPILOT_DOCK_COMPOSER_CARD_CLASS =
  "border bg-card/95 shadow-lg supports-[backdrop-filter]:bg-card/85 supports-[backdrop-filter]:backdrop-blur";

/** Soft top fade when transcript scrolls under the panel header. */
export const COPILOT_TRANSCRIPT_TOP_FADE_CLASS =
  "pointer-events-none absolute inset-x-0 top-0 z-10 h-14 bg-[linear-gradient(180deg,var(--copilot-fade-color,var(--color-card))_0%,color-mix(in_oklch,var(--copilot-fade-color,var(--color-card))_72%,transparent)_20%,color-mix(in_oklch,var(--copilot-fade-color,var(--color-card))_38%,transparent)_44%,color-mix(in_oklch,var(--copilot-fade-color,var(--color-card))_14%,transparent)_66%,color-mix(in_oklch,var(--copilot-fade-color,var(--color-card))_4%,transparent)_82%,transparent_100%)] transition-opacity duration-300";

const COPILOT_AUTOSCROLL_BOTTOM_THRESHOLD = 160;

export function resolveCopilotTranscriptBottomPaddingClass(input: {
  compact: boolean;
  composerDockStyle: boolean;
}): string {
  if (input.compact) {
    return "pb-1";
  }
  // The same during a run and after it: space that shrinks when the run ends
  // collapses the transcript under the reader and moves the view.
  return input.composerDockStyle ? "pb-20" : "pb-6";
}

export function getCopilotTranscriptScrollTop(
  viewport: Pick<HTMLElement, "clientHeight" | "scrollHeight">,
  extraBottomInset = 0
): number {
  return Math.max(
    0,
    viewport.scrollHeight - viewport.clientHeight - extraBottomInset
  );
}

export function isCopilotScrollViewportNearBottom(
  viewport: Pick<HTMLElement, "clientHeight" | "scrollHeight" | "scrollTop">
): boolean {
  return (
    viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <=
    COPILOT_AUTOSCROLL_BOTTOM_THRESHOLD
  );
}

export function shouldCenterCopilotEmptyLanding(input: {
  bodyOnly: boolean;
  composerDockStyle: boolean;
  showEmptyLanding: boolean;
}): boolean {
  return input.showEmptyLanding && input.composerDockStyle && input.bodyOnly;
}

export function resolveCopilotEmptyLandingAlign(input: {
  bodyOnly: boolean;
  composerDockStyle: boolean;
  emptyLandingAlign?: CopilotEmptyLandingAlign;
  preferCenter?: boolean;
  showEmptyLanding: boolean;
}): CopilotEmptyLandingAlign | undefined {
  if (!input.showEmptyLanding) {
    return;
  }
  if (input.emptyLandingAlign) {
    return input.emptyLandingAlign;
  }
  if (input.preferCenter === false) {
    return;
  }
  if (input.preferCenter === true) {
    return "center";
  }
  return shouldCenterCopilotEmptyLanding(input) ? "center" : undefined;
}
