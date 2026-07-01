import type { PageBreadcrumb } from "@engenty/ui-plugin-sdk";
import { Library } from "lucide-react";

/** First crumb for KB module: full title on desktop, library icon on compact layouts. */
export function kbKnowledgeBaseRootCrumb(
  label: string,
  to?: string
): PageBreadcrumb {
  const base: PageBreadcrumb = {
    label,
    compactLabel: <Library aria-hidden className="size-4 shrink-0" />,
    menuLabel: label,
  };
  return to ? { ...base, to } : base;
}
