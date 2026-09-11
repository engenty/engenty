/**
 * Wires the KB module into the shell's secondary column: the space's
 * knowledge base name in the header slot and {@link KbModuleSidebar} as the
 * body (the article tree when the space has a library, the empty hint when
 * it has none).
 *
 * Also returns `kbRootCrumb` — the first breadcrumb segment (the library's
 * name, linking to its hub) when the sidebar is collapsed; null while the
 * sidebar is open, where the header already shows it.
 */

import { useShellSecondaryNav } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import type { PageBreadcrumb } from "@engenty/ui-plugin-sdk";
import { type ReactNode, useMemo } from "react";
import { KbShellHeader } from "../components/kb-shell-header.js";
import { KbModuleSidebar } from "../components/kb-sidebar/kb-module-sidebar.js";
import { kbDisplayName } from "../kb-display-name.js";
import { kbHubPath } from "../kb-paths.js";
import { useKbsQuery } from "../queries.js";
import { spaceKbId } from "../resolve-kb-id.js";

export function useKbModuleSecondaryShellNav(options: {
  activeArticleId?: string;
  /** The page's knowledge base; falls back to the space's one library while the page resolves it. */
  kbId?: string;
}): {
  secondaryNavAfterItems: ReactNode;
  secondaryNavHeaderSlot: ReactNode;
  /**
   * First breadcrumb segment for KB pages: the library's name when the sidebar is collapsed.
   * Spread into `breadcrumbs` as `...(kbShellNav.kbRootCrumb ? [kbShellNav.kbRootCrumb] : [])`.
   */
  kbRootCrumb: PageBreadcrumb | null;
} {
  const { activeArticleId, kbId: kbIdProp } = options;
  const { t } = useTranslation("kb");
  const { secondaryNavOpen } = useShellSecondaryNav();
  const { data: kbsRaw, isLoading: kbsLoading } = useKbsQuery();
  const kbs = useMemo(() => (Array.isArray(kbsRaw) ? kbsRaw : []), [kbsRaw]);
  const kbId = kbIdProp || spaceKbId(kbs);
  const kb = useMemo(() => kbs.find((k) => k.id === kbId), [kbs, kbId]);

  const secondaryNavHeaderSlot = useMemo(
    () => <KbShellHeader isLoading={kbsLoading} kb={kb ?? null} />,
    [kb, kbsLoading]
  );

  const kbRootCrumb = useMemo<PageBreadcrumb | null>(() => {
    if (secondaryNavOpen || !kb) {
      return null;
    }
    const name = kbDisplayName(kb, t);
    return { compactKept: true, label: name, menuLabel: name, to: kbHubPath() };
  }, [kb, secondaryNavOpen, t]);

  const secondaryNavAfterItems = useMemo(
    () => <KbModuleSidebar activeArticleId={activeArticleId} kbId={kbId} />,
    [activeArticleId, kbId]
  );

  return { secondaryNavAfterItems, secondaryNavHeaderSlot, kbRootCrumb };
}
