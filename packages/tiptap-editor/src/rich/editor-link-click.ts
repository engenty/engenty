/**
 * Optional SPA navigation for <a href> inside the ProseMirror surface.
 */

import type { EditorView } from "@tiptap/pm/view";

/**
 * Called when the user activates a link inside read-only (or editable) rich text.
 * Return true after handling to suppress the browser default (full navigation).
 */
export type RichEditorLinkClickHandler = (
  href: string,
  event: MouseEvent
) => boolean;

export function buildEditorPropsForLinkClicks(
  onLinkClick: RichEditorLinkClickHandler | undefined
):
  | {
      handleDOMEvents: {
        click: (view: EditorView, event: MouseEvent) => boolean;
      };
    }
  | undefined {
  if (!onLinkClick) {
    return;
  }
  return {
    handleDOMEvents: {
      click(_view, event) {
        const t = event.target;
        if (!(t instanceof Element)) {
          return false;
        }
        const a = t.closest("a[href]");
        if (!(a instanceof HTMLAnchorElement)) {
          return false;
        }
        const href = a.getAttribute("href");
        if (!href || href.startsWith("#")) {
          return false;
        }
        if (onLinkClick(href, event)) {
          event.preventDefault();
          return true;
        }
        return false;
      },
    },
  };
}
