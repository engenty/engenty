/**
 * Tasks-style module nav + entity tabs for the KB secondary column.
 */

import { shellSecondaryNavItemProps } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import {
  cn,
  SidebarNavList,
  SidebarRow,
  SidebarRowButton,
  SidebarTab,
  SidebarTabStrip,
  sidebarColumnContentInsetClassName,
  sidebarColumnContentInsetEndClassName,
} from "@engenty/ui-core";
import {
  FileText,
  HelpCircle,
  LayoutDashboard,
  MessageSquare,
  Star,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import {
  isKbHubChatRoute,
  kbArticlesListPath,
  kbFaqsListPath,
  kbHubChatPath,
  kbHubPath,
} from "../../kb-paths.js";
import {
  isKbArticlesListNavPath,
  isKbFaqsListNavPath,
  isKbHubStartPath,
} from "../../lib/kb-sidebar-paths.js";
import type { KbSidebarTab } from "../../lib/use-kb-sidebar-tab.js";

function KbSidebarNavRow({
  active,
  icon: Icon,
  label,
  to,
}: {
  active: boolean;
  icon: typeof LayoutDashboard;
  label: string;
  to: string;
}) {
  return (
    <SidebarRow isActive={active}>
      <SidebarRowButton asChild isActive={active}>
        <Link to={to} {...shellSecondaryNavItemProps}>
          <Icon aria-hidden className="size-4 shrink-0" />
          <span className="truncate">{label}</span>
        </Link>
      </SidebarRowButton>
    </SidebarRow>
  );
}

export function KbSidebarChrome({
  kbSlug,
  onTabChange,
  tab,
}: {
  kbSlug: string;
  onTabChange: (tab: KbSidebarTab) => void;
  tab: KbSidebarTab;
}) {
  const { t } = useTranslation("kb");
  const { pathname } = useLocation();

  const navActive = {
    start: isKbHubStartPath(pathname, kbSlug),
    articles: isKbArticlesListNavPath(pathname, kbSlug),
    faqs: isKbFaqsListNavPath(pathname, kbSlug),
    chat: isKbHubChatRoute(pathname),
  };

  return (
    <>
      <nav
        aria-label={t("sidebar.module_nav_aria")}
        className={cn(
          "pt-2",
          sidebarColumnContentInsetClassName,
          sidebarColumnContentInsetEndClassName
        )}
      >
        <SidebarNavList>
          <KbSidebarNavRow
            active={navActive.start}
            icon={LayoutDashboard}
            label={t("sidebar.nav_start")}
            to={kbHubPath(kbSlug)}
          />
          <KbSidebarNavRow
            active={navActive.articles}
            icon={FileText}
            label={t("inbox.nav_articles")}
            to={kbArticlesListPath(kbSlug)}
          />
          <KbSidebarNavRow
            active={navActive.faqs}
            icon={HelpCircle}
            label={t("inbox.nav_faqs")}
            to={kbFaqsListPath(kbSlug)}
          />
          <KbSidebarNavRow
            active={navActive.chat}
            icon={MessageSquare}
            label={t("sidebar.nav_chat")}
            to={kbHubChatPath(kbSlug)}
          />
        </SidebarNavList>
      </nav>

      <SidebarTabStrip
        onValueChange={(value) => onTabChange(value as KbSidebarTab)}
        value={tab}
      >
        <SidebarTab value="articles">{t("sidebar.tabs.articles")}</SidebarTab>
        <SidebarTab value="faqs">{t("sidebar.tabs.faqs")}</SidebarTab>
        <SidebarTab value="chat">{t("sidebar.tabs.chat", "Chat")}</SidebarTab>
        <SidebarTab
          aria-label={t("sidebar.tabs.favorites")}
          icon
          title={t("sidebar.tabs.favorites")}
          value="favorites"
        >
          <Star aria-hidden className="size-3.5" />
        </SidebarTab>
      </SidebarTabStrip>
    </>
  );
}
