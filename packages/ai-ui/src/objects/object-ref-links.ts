import {
  canonicalModulePathname,
  formatObjectRef,
  type ObjectRef,
} from "@engenty/ai-core/browser";
import type { ObjectWidgetRegistration } from "./object-widget-registry.js";

/**
 * Module deep links written in markdown (`[ACME](/mdl/contacts/<id>)`), read
 * back as the objects they point at. `matchHref` on each registered widget is
 * the reverse of its `getHref`, so prose that merely names a record is enough
 * to show it: the mention chips under a message and the record a wizard just
 * wrote both find their object this way.
 *
 * A link minted inside a space points at the mirrored route
 * (`/s/<key>/offers/<id>`), which no widget's matcher describes — so each one
 * is asked about its canonical `/mdl/…` form.
 */
export interface ObjectRefLink {
  href: string;
  ref: ObjectRef;
  title: string;
}

/** `[label](/mdl/…)` or its in-space mirror `[label](/s/<key>/…)`. */
const MD_INTERNAL_LINK =
  /\[([^\]]+)\]\(\s*(?:https?:\/\/[^/)\s]+)?(\/(?:mdl|s)\/[^)\s]+?)\s*\)/g;

export function objectRefLinksInMarkdown(
  text: string,
  widgets: readonly ObjectWidgetRegistration[],
  limit: number
): ObjectRefLink[] {
  if (widgets.length === 0) {
    return [];
  }
  const found: ObjectRefLink[] = [];
  const seen = new Set<string>();
  MD_INTERNAL_LINK.lastIndex = 0;
  let match: RegExpExecArray | null = MD_INTERNAL_LINK.exec(text);
  while (match && found.length < limit) {
    const title = match[1]?.trim();
    const href = match[2]?.trim();
    if (title && href) {
      const canonical = canonicalModulePathname(href);
      for (const widget of widgets) {
        const ref = widget.matchHref?.(canonical) ?? null;
        if (ref) {
          const key = formatObjectRef(ref);
          if (!seen.has(key)) {
            seen.add(key);
            found.push({ href, ref, title });
          }
          break;
        }
      }
    }
    match = MD_INTERNAL_LINK.exec(text);
  }
  return found;
}
