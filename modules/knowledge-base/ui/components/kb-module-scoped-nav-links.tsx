/**
 * Scoped KB section links (Articles, FAQs, Sources, …) for the shell secondary column.
 * Without a KB slug, links use module-level routes and tenant settings where applicable.
 */

import { shellSecondaryNavItemProps } from "@engenty/app-shell";
import { matchesPath } from "@engenty/app-shell/navigation";
import { useTranslation } from "@engenty/i18n/ui";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarNavList,
  SidebarRow,
  SidebarRowButton,
  SidebarRowLeadingIcon,
  SidebarSectionLabel,
} from "@engenty/ui-core";
import { useCanAdministerTenant } from "@engenty/ui-plugin-sdk";
import type { LucideIcon } from "lucide-react";
import {
  Database,
  FileText,
  HelpCircle,
  House,
  Network,
  Settings,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  KB_ARTICLES_LIST_PATH,
  KB_FAQS_LIST_PATH,
  KB_MODULE_BASE,
  KB_MODULE_SETTINGS_PATH,
  kbArticlesListPath,
  kbFaqsListPath,
  kbGraphPath,
  kbHubPath,
  kbScopedSettingsPath,
  kbSourcesPath,
} from "../kb-paths.js";

function KbScopedNavLinkRow({
  pathname,
  search,
  to,
  Icon,
  children,
}: {
  pathname: string;
  search: string;
  to: string;
  Icon: LucideIcon;
  children: ReactNode;
}) {
  const isActive = matchesPath(pathname, search, to);

  return (
    <SidebarRow isActive={isActive}>
      <SidebarRowLeadingIcon icon={<Icon aria-hidden />} />
      <SidebarRowButton asChild isActive={isActive} size="sm">
        <Link to={to} {...shellSecondaryNavItemProps}>
          <span className="truncate">{children}</span>
        </Link>
      </SidebarRowButton>
    </SidebarRow>
  );
}

export function KbModuleScopedNavLinks({
  kbSlug,
  secondaryOnly = false,
}: {
  kbSlug?: string;
  secondaryOnly?: boolean;
} = {}) {
  const { t } = useTranslation("kb");
  const canAdministerTenant = useCanAdministerTenant();
  const { pathname, search } = useLocation();
  const slug = kbSlug?.trim() ?? "";

  const articlesTo = slug ? kbArticlesListPath(slug) : KB_ARTICLES_LIST_PATH;
  const faqsTo = slug ? kbFaqsListPath(slug) : KB_FAQS_LIST_PATH;
  const sourcesTo = slug ? kbSourcesPath(slug) : KB_MODULE_BASE;
  const graphTo = slug ? kbGraphPath(slug) : KB_MODULE_BASE;
  const settingsTo = slug
    ? kbScopedSettingsPath(slug)
    : KB_MODULE_SETTINGS_PATH;
  const settingsLabel = slug
    ? t("scoped_settings.nav_link")
    : t("sidebar.module_settings");

  const rowProps = { pathname, search };

  return (
    <nav aria-label={t("sources.shell_nav_aria")} className="shrink-0 pt-2">
      <SidebarGroup className="p-0">
        {secondaryOnly ? null : (
          <SidebarSectionLabel align="root">
            {t("sources.nav_section")}
          </SidebarSectionLabel>
        )}
        <SidebarGroupContent>
          <SidebarNavList>
            {slug && !secondaryOnly ? (
              <KbScopedNavLinkRow
                {...rowProps}
                Icon={House}
                to={kbHubPath(slug)}
              >
                {t("sidebar.switcher_hub")}
              </KbScopedNavLinkRow>
            ) : null}
            {slug && !secondaryOnly ? (
              <KbScopedNavLinkRow {...rowProps} Icon={FileText} to={articlesTo}>
                {t("inbox.nav_articles")}
              </KbScopedNavLinkRow>
            ) : null}
            {slug && !secondaryOnly ? (
              <KbScopedNavLinkRow {...rowProps} Icon={HelpCircle} to={faqsTo}>
                {t("inbox.nav_faqs")}
              </KbScopedNavLinkRow>
            ) : null}
            <KbScopedNavLinkRow {...rowProps} Icon={Database} to={sourcesTo}>
              {t("sources.nav_sources")}
            </KbScopedNavLinkRow>
            <KbScopedNavLinkRow {...rowProps} Icon={Network} to={graphTo}>
              {t("inbox.nav_graph")}
            </KbScopedNavLinkRow>
            {/* With a slug this is the per-KB module page (fine for anyone);
                without one it falls back to /settings/knowledge-base, which is
                admin-only and redirects members away silently — so hide it. */}
            {slug || canAdministerTenant ? (
              <KbScopedNavLinkRow {...rowProps} Icon={Settings} to={settingsTo}>
                {settingsLabel}
              </KbScopedNavLinkRow>
            ) : null}
          </SidebarNavList>
        </SidebarGroupContent>
      </SidebarGroup>
    </nav>
  );
}
