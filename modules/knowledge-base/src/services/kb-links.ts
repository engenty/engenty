/**
 * In-app links for the records a Knowledge Base tool hands back.
 *
 * Every page of this module is mirrored at `/s/<space_key>/kb/…` (apps/ui
 * `space-route-mirrors.ts`, short segment from ai-core's
 * `SPACE_MODULE_URL_ALIASES`), and a space has exactly one knowledge
 * base, so a record's canonical link is the space form, built here from the
 * KB's space key — path-only, on the UI origin, exactly what the chat renders
 * as a clickable link.
 *
 * Why the tool result carries the link instead of the model building it: an
 * agent inside a space has no route table and no host, only ids. Left to
 * itself it reaches for a pre-space `/kb/<id>/<slug>` shape, or asks the
 * person for a "base domain" — both seen on the KB manager desk. A field it
 * can copy verbatim removes the guess.
 *
 * The `/mdl/…` form is the fallback when the space key could not be resolved:
 * the shell's LegacyModuleRedirect still lands it in the record's own space,
 * one hop later.
 */
import { spaceModuleUrlSegment } from "@engenty/ai-core";
import {
  KB_MODULE_BASE,
  KB_MODULE_ID,
  kbArticlePath,
  kbCategoryPath,
  kbFaqPath,
  kbHubPath,
  kbSourcePath,
} from "../../ui/kb-paths.js";

export interface KbLinkTarget {
  /** URL key of the KB's space; null falls back to the `/mdl/…` form. */
  spaceKey: string | null;
}

export interface KbLinks {
  article(articleId: string): string;
  category(categorySlug: string): string;
  faq(faqId: string): string;
  hub(): string;
  source(sourceId: string): string;
}

/** `/mdl/knowledge-base/…` → `/s/<key>/kb/…`; no key keeps it. */
export function kbSpacePath(
  spaceKey: string | null,
  modulePath: string
): string {
  if (!(spaceKey && modulePath.startsWith(KB_MODULE_BASE))) {
    return modulePath;
  }
  return `/s/${encodeURIComponent(spaceKey)}/${spaceModuleUrlSegment(KB_MODULE_ID)}${modulePath.slice(KB_MODULE_BASE.length)}`;
}

export function createKbLinks(target: KbLinkTarget): KbLinks {
  const inSpace = (path: string) => kbSpacePath(target.spaceKey, path);
  return {
    article: (articleId) => inSpace(kbArticlePath(articleId)),
    category: (categorySlug) => inSpace(kbCategoryPath(categorySlug)),
    faq: (faqId) => inSpace(kbFaqPath(faqId)),
    hub: () => inSpace(kbHubPath()),
    source: (sourceId) => inSpace(kbSourcePath(sourceId)),
  };
}
