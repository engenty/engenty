/**
 * Bridges speed-dial Prompt into an on-page inline Ask, or the Work composer.
 * Pages that own an inline prompt register a focuser; the blob Prompt action
 * tries that first, then opens Work and focuses its composer.
 */

type FocusFn = () => boolean;

let inlineAskFocus: FocusFn | null = null;
let workComposerFocus: (() => void) | null = null;

/** Register a page-owned inline Ask. Returns an unregister function. */
export function registerInlineAskFocus(focus: FocusFn): () => void {
  inlineAskFocus = focus;
  return () => {
    if (inlineAskFocus === focus) {
      inlineAskFocus = null;
    }
  };
}

/** Focus the page-owned inline Ask when one is mounted. */
export function focusInlineAsk(): boolean {
  return inlineAskFocus?.() ?? false;
}

/** Register the Work / Window composer so Prompt can land in it. */
export function registerWorkComposerFocus(focus: () => void): () => void {
  workComposerFocus = focus;
  return () => {
    if (workComposerFocus === focus) {
      workComposerFocus = null;
    }
  };
}

/** Focus the Work composer if that panel is mounted. */
export function focusWorkComposer(): boolean {
  if (!workComposerFocus) {
    return false;
  }
  workComposerFocus();
  return true;
}
