/**
 * Client-side navigation for same-origin module links rendered inside TipTap.
 */

import type { RichEditorLinkClickHandler } from "@engenty/tiptap-editor";
import type { NavigateFunction } from "react-router-dom";

/**
 * Handler for TipTap `onLinkClick`: same-origin URLs whose path starts with `/mdl/`
 * use React Router instead of a full document load. Modifier-clicks and non-primary
 * clicks are left to the browser.
 */
export function createKbModuleRichEditorLinkHandler(
  navigate: NavigateFunction
): RichEditorLinkClickHandler {
  return (href, event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return false;
    }
    if (event.button !== 0) {
      return false;
    }
    try {
      const url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin) {
        return false;
      }
      const path = `${url.pathname}${url.search}${url.hash}`;
      if (!path.startsWith("/mdl/")) {
        return false;
      }
      navigate(path);
      return true;
    } catch {
      return false;
    }
  };
}
