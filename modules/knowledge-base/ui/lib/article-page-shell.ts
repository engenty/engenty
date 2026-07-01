/**
 * Article view/edit shell — re-exports module shells; article-only typography below.
 */

import { kbModulePageShellSectionClassName } from "./kb-page-shell.js";

export const kbArticlePageShellSectionClassName =
  kbModulePageShellSectionClassName;

/** Centered article column inside the shell. */
export const kbArticlePageShellInnerBaseClassName =
  "kb-article-print mx-auto w-full max-w-3xl space-y-6 p-2";

/** Shared title typography for article detail `h1` and edit inline title (parity across routes). */
export const kbArticlePageTitleClassName =
  "font-heading font-medium text-[28px] leading-9 tracking-tight";

/** Reset chrome for the inline title `<input>`; combine with `kbArticlePageTitleClassName`. */
export const kbArticlePageTitleInputResetClassName =
  "w-full min-w-0 border-0 bg-transparent p-0 shadow-none outline-none ring-0 placeholder:text-muted-foreground focus:ring-0";
