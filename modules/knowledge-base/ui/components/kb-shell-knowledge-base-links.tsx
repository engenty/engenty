/**
 * Knowledge base switcher for the app shell secondary column header.
 * Delegates menu content to {@link KbSwitcherPopover} (same as breadcrumb).
 */

import { useShellSecondaryNav } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { type ContextPopoverRenderLink, cn } from "@engenty/ui-core";
import { useCanAdministerTenant } from "@engenty/ui-plugin-sdk";
import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { KnowledgeBase } from "../../src/schema/types.js";
import { kbDisplayName } from "../kb-display-name.js";
import { KB_MODULE_SETTINGS_PATH } from "../kb-paths.js";
import { KbSwitcherPopover } from "./kb-switcher-popover.js";

const renderLink: ContextPopoverRenderLink = ({
  to,
  className,
  onClick,
  children,
}) => (
  <Link className={className} onClick={onClick} to={to}>
    {children}
  </Link>
);

export function KbShellKnowledgeBaseLinks({
  activeKbId,
  kbs,
  isLoading,
  onSelect,
  secondaryNavOpen: secondaryNavOpenProp,
}: {
  activeKbId: string;
  /** KB list owned by `useKbModuleSecondaryShellNav` (shared cache, no extra fetch). */
  kbs: KnowledgeBase[];
  isLoading: boolean;
  /** `onKbChange`-aware handler from the hook — same navigation as the breadcrumb picker. */
  onSelect: (nextKbId: string) => void;
  /**
   * From `useShellSecondaryNav()`. When false (collapsed shell or hover-preview column),
   * the menu chevron stays visible for discoverability; when true (pinned open), the
   * chevron matches Drive: hidden until row hover, open state, or keyboard focus.
   */
  secondaryNavOpen: boolean;
}) {
  const { t } = useTranslation("kb");
  const { setSecondaryNavHoverMenuOpen } = useShellSecondaryNav();

  const [open, setOpen] = useState(false);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!secondaryNavOpenProp) {
      setSecondaryNavHoverMenuOpen(next);
    }
  };

  useEffect(
    () => () => {
      if (!secondaryNavOpenProp) {
        setSecondaryNavHoverMenuOpen(false);
      }
    },
    [secondaryNavOpenProp, setSecondaryNavHoverMenuOpen]
  );

  const canAdministerTenant = useCanAdministerTenant();
  const activeKb = useMemo(
    () => kbs.find((k) => k.id === activeKbId) ?? kbs[0],
    [kbs, activeKbId]
  );

  if (isLoading && kbs.length === 0) {
    return <div className="h-6 w-32 animate-pulse rounded bg-muted/70" />;
  }

  if (kbs.length === 0) {
    // The settings path is admin-only and redirects members away in silence,
    // so for them this is plain text rather than a link to nowhere.
    if (!canAdministerTenant) {
      return (
        <span className="min-w-0 truncate font-semibold text-foreground text-sm">
          {t("menu.knowledge_base")}
        </span>
      );
    }
    return (
      <Link
        className="min-w-0 truncate font-semibold text-foreground text-sm hover:opacity-70"
        title={t("sidebar.create_kb_hint")}
        to={KB_MODULE_SETTINGS_PATH}
      >
        {t("menu.knowledge_base")}
      </Link>
    );
  }

  const triggerLabel = activeKb
    ? kbDisplayName(activeKb, t)
    : t("sidebar.pick_kb");

  const chevronVisibilityClass = secondaryNavOpenProp
    ? cn(
        "opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100",
        open && "opacity-100"
      )
    : "opacity-100";

  return (
    <nav aria-label={t("sidebar.kb_switcher_aria")} className="min-w-0">
      <KbSwitcherPopover
        activeKbId={activeKbId}
        chevronClassName={chevronVisibilityClass}
        controlledOpen={open}
        kbs={kbs}
        onOpenChange={handleOpenChange}
        onSelect={onSelect}
        openOn="click"
        renderLink={renderLink}
        trigger={
          <button
            className="group flex w-full min-w-0 items-center gap-1 rounded-sm py-0.5 text-left font-semibold text-foreground text-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            type="button"
          >
            <span className="min-w-0 flex-1 truncate">{triggerLabel}</span>
            <ChevronDown
              aria-hidden
              className={cn(
                "size-4 shrink-0 text-muted-foreground",
                chevronVisibilityClass
              )}
            />
          </button>
        }
      />
    </nav>
  );
}
