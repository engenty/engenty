/**
 * Interaction budgets for the product UI.
 *
 * Product numbers are the destination. CI starts on {@link CI_GROSS_REGRESSION}
 * so a Vite-dev smoke lane can collect a baseline before tightening.
 *
 * Keep `e2e/interaction-budgets.ts` in sync — Playwright cannot import this
 * file (it is bundled with `import.meta.env` via the UI app).
 */

/** Warm click → route URL / first local feedback. */
export const PRODUCT_INTERACTION_RESPONSE_P95_MS = 100;

/** Long-task duration on the main thread during an interaction. */
export const PRODUCT_MAIN_THREAD_TASK_MS = 50;

/** Warm / cached destination paint (not cold network). */
export const PRODUCT_CACHED_PAINT_P95_MS = 200;

/**
 * React's default transition expiration. A navigation that waits this long
 * is starved, not slow. `BrowserRouter useTransitions={false}` exists to
 * keep us off this path.
 */
export const REACT_TRANSITION_EXPIRATION_MS = 5000;

/**
 * Stable CI fail line. Tighten toward the product budgets after the smoke
 * lane has a baseline of published timings.
 */
export const CI_GROSS_REGRESSION = {
  cachedPaintP95Ms: 3000,
  interactionMaxMs: 4500,
  interactionResponseP95Ms: 2000,
  longTaskMaxMs: 4500,
} as const;
