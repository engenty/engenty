"use client";

import {
  type EffortResolvedFlash,
  useEffortResolvedFlash,
} from "./effort-resolved-flash.js";

/**
 * Subscribe to Auto effort flashes for a host and return the active flash for
 * the effort selector.
 *
 * Deliberately silent: this used to also raise a toast. A toast is the wrong
 * weight for "Auto picked a tier" — it is ambient information about a control
 * the user can see, it fired on every Auto turn, and being bottom-anchored it
 * sat on top of the composer's own submit button. The selector shows the
 * resolution in place instead.
 */
export function useEffortResolvedFeedback(
  hostKey: string
): EffortResolvedFlash | null {
  return useEffortResolvedFlash(hostKey);
}
