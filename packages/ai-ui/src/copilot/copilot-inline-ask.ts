/**
 * Puts the caret in the Work composer once the blob has opened it.
 *
 * `registerInlineAskFocus` / `focusInlineAsk` are the older half: Prompt used
 * to hand off to a page's own inline Ask field when one was mounted, and open
 * the companion only otherwise. Prompt now always shows its floating input, so
 * nothing calls them — they stay only because `focusInlineAsk` is exported
 * from the package index and a plugin may hold it.
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
