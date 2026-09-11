/**
 * Secondary-column header for the KB module: the space's knowledge base,
 * linking to its hub. There is nothing to switch between — a space has one.
 */

import { useTranslation } from "@engenty/i18n/ui";
import { Link } from "react-router-dom";
import type { KnowledgeBase } from "../../src/schema/types.js";
import { kbDisplayName } from "../kb-display-name.js";
import { kbHubPath } from "../kb-paths.js";

export function KbShellHeader({
  isLoading,
  kb,
}: {
  isLoading: boolean;
  kb: KnowledgeBase | null;
}) {
  const { t } = useTranslation("kb");
  if (isLoading && !kb) {
    return <div className="h-6 w-32 animate-pulse rounded bg-muted/70" />;
  }
  if (!kb) {
    return (
      <span className="min-w-0 truncate font-semibold text-foreground text-sm">
        {t("menu.knowledge_base")}
      </span>
    );
  }
  return (
    <Link
      className="min-w-0 truncate font-semibold text-foreground text-sm hover:opacity-70"
      to={kbHubPath()}
    >
      {kbDisplayName(kb, t)}
    </Link>
  );
}
