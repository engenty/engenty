/**
 * Renders KB switcher in the shell column header slot and {@link KbModuleSidebar}
 * in the secondary column body (full tree when a KB is active, module overview otherwise).
 *
 * Also returns `kbRootCrumb` — a context-aware first breadcrumb segment: shows the KB
 * picker when the sidebar is closed, or null when the sidebar is open
 * (the KB switcher is already visible in the sidebar header).
 */

import { useShellSecondaryNav } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import type { PageBreadcrumb } from "@engenty/ui-plugin-sdk";
import { type ReactNode, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { kbPickerBreadcrumbSegment } from "../components/kb-breadcrumb-picker.js";
import { KbShellKnowledgeBaseLinks } from "../components/kb-shell-knowledge-base-links.js";
import { KbModuleSidebar } from "../components/kb-sidebar/kb-module-sidebar.js";
import { kbHubPath } from "../kb-paths.js";
import { kbsQueryOptions } from "../queries.js";

export function useKbModuleSecondaryShellNav(options: {
  activeArticleId?: string;
  kbId: string;
  kbSlug: string;
  /**
   * Called when the user picks a different KB from the breadcrumb switcher.
   * Defaults to navigating to the new KB's hub page.
   */
  onKbChange?: (nextKbId: string) => void;
}): {
  secondaryNavAfterItems: ReactNode;
  /** @deprecated Prefer secondaryNavHeaderSlot; kept null — switcher lives in the header slot only. */
  secondaryNavBeforeItems: ReactNode;
  secondaryNavHeaderSlot: ReactNode;
  /**
   * First breadcrumb segment for KB pages: KB picker when the sidebar is closed.
   * Spread into `breadcrumbs` as `...(kbShellNav.kbRootCrumb ? [kbShellNav.kbRootCrumb] : [])`.
   */
  kbRootCrumb: PageBreadcrumb | null;
} {
  const { activeArticleId, kbId: kbIdProp, kbSlug, onKbChange } = options;
  const { t } = useTranslation("kb");
  const navigate = useNavigate();
  const { secondaryNavOpen } = useShellSecondaryNav();
  const { data: kbsRaw, isLoading: kbsLoading } = useQuery(kbsQueryOptions);
  const kbs = useMemo(() => (Array.isArray(kbsRaw) ? kbsRaw : []), [kbsRaw]);

  // Resolve kbId from slug when the page hasn't finished loading its own KB data yet.
  // This ensures kbRootCrumb is available immediately (slug is always in the URL).
  const kbId =
    kbIdProp || (kbSlug ? (kbs.find((k) => k.slug === kbSlug)?.id ?? "") : "");

  const handleKbChange = useCallback(
    (nextKbId: string) => {
      if (onKbChange) {
        onKbChange(nextKbId);
        return;
      }
      const next = kbs.find((k) => k.id === nextKbId);
      if (next) {
        navigate(kbHubPath(next.slug));
      }
    },
    [kbs, navigate, onKbChange]
  );

  // Sidebar header switcher shares the hook's KB list and `onKbChange`-aware
  // handler so it navigates identically to the breadcrumb picker (no separate fetch).
  const kbSwitcher = useMemo(
    () => (
      <KbShellKnowledgeBaseLinks
        activeKbId={kbId}
        isLoading={kbsLoading}
        kbs={kbs}
        onSelect={handleKbChange}
        secondaryNavOpen={secondaryNavOpen}
      />
    ),
    [handleKbChange, kbId, kbs, kbsLoading, secondaryNavOpen]
  );

  const kbRootCrumb = useMemo<PageBreadcrumb | null>(() => {
    // Sidebar open: KB switcher visible in the header slot — omit from breadcrumb.
    if (secondaryNavOpen) {
      return null;
    }
    // KBs not yet loaded — breadcrumb will appear once the query resolves.
    if (kbs.length === 0) {
      return null;
    }
    // kbId still resolving (should be brief after kbs load).
    if (!kbId) {
      return null;
    }
    return kbPickerBreadcrumbSegment({
      kbId,
      kbs,
      onSelect: handleKbChange,
      t,
    });
  }, [handleKbChange, kbId, kbs, secondaryNavOpen, t]);

  const secondaryNavAfterItems = useMemo(
    () => (
      <KbModuleSidebar
        activeArticleId={activeArticleId}
        kbId={kbId}
        kbSlug={kbSlug}
      />
    ),
    [activeArticleId, kbId, kbSlug]
  );

  return {
    secondaryNavAfterItems,
    secondaryNavBeforeItems: null,
    secondaryNavHeaderSlot: kbSwitcher,
    kbRootCrumb,
  };
}
