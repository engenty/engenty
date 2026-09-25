/**
 * Playwright copy of apps/ui/src/lib/interaction-budgets.ts.
 *
 * Keep the numbers identical. The UI file cannot be imported here because it
 * lives behind Vite `import.meta.env`.
 *
 * Product budgets (destination, not yet the CI fail line):
 *   interaction response p95 < 100ms
 *   main-thread task < 50ms
 *   cached content paint p95 < 200ms
 *   no navigation may wait for React’s 5s transition expiration
 *
 * Routing decision: `BrowserRouter useTransitions={false}` in
 * `apps/ui/src/main.tsx` while the app still has `useSyncExternalStore`
 * (copilot / host / live-cache). Re-evaluate that flag on react /
 * react-dom / react-router-dom upgrades by running this suite:
 *   pnpm test:smoke:interaction
 */

export const PRODUCT_INTERACTION_RESPONSE_P95_MS = 100;
export const PRODUCT_MAIN_THREAD_TASK_MS = 50;
export const PRODUCT_CACHED_PAINT_P95_MS = 200;
export const REACT_TRANSITION_EXPIRATION_MS = 5000;

/** Stable CI fail line — tighten toward the product budgets after baselines. */
export const CI_GROSS_REGRESSION = {
  cachedPaintP95Ms: 3000,
  interactionMaxMs: 4500,
  interactionResponseP95Ms: 2000,
  longTaskMaxMs: 4500,
} as const;

export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  );
  return sorted[rank] ?? 0;
}
