/**
 * KB section links (Home, Articles, FAQs, Sources, Graph, Settings) for the
 * shell secondary column. A space has one knowledge base, so every link is a
 * fixed module path; nothing here depends on which library is open.
 */

import { canonicalModulePathname } from "@engenty/ai-core/browser";
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
  kbArticlesListPath,
  kbBrowsePath,
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
  alsoActive,
}: {
  pathname: string;
  search: string;
  to: string;
  Icon: LucideIcon;
  children: ReactNode;
  alsoActive?: string[];
}) {
  const isActive =
    matchesPath(pathname, search, to) ||
    (alsoActive ?? []).some((path) => matchesPath(pathname, search, path));

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
  secondaryOnly = false,
}: {
  /** Only the secondary links (Sources, Graph, Settings) — the tree already shows the rest. */
  secondaryOnly?: boolean;
} = {}) {
  const { t } = useTranslation("kb");
  // Canonical, not raw: in a space this is `/s/<key>/kb/…`, and
  // every matcher below is written against `/mdl/knowledge-base/…`.
  const { pathname: rawPathname, search } = useLocation();
  const pathname = canonicalModulePathname(rawPathname);
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
            {secondaryOnly ? null : (
              <>
                <KbScopedNavLinkRow {...rowProps} Icon={House} to={kbHubPath()}>
                  {t("sidebar.switcher_hub")}
                </KbScopedNavLinkRow>
                <KbScopedNavLinkRow
                  {...rowProps}
                  alsoActive={[kbBrowsePath()]}
                  Icon={FileText}
                  to={kbArticlesListPath()}
                >
                  {t("inbox.nav_articles")}
                </KbScopedNavLinkRow>
                <KbScopedNavLinkRow
                  {...rowProps}
                  Icon={HelpCircle}
                  to={kbFaqsListPath()}
                >
                  {t("inbox.nav_faqs")}
                </KbScopedNavLinkRow>
              </>
            )}
            <KbScopedNavLinkRow
              {...rowProps}
              Icon={Database}
              to={kbSourcesPath()}
            >
              {t("sources.nav_sources")}
            </KbScopedNavLinkRow>
            <KbScopedNavLinkRow {...rowProps} Icon={Network} to={kbGraphPath()}>
              {t("inbox.nav_graph")}
            </KbScopedNavLinkRow>
            <KbScopedNavLinkRow
              {...rowProps}
              Icon={Settings}
              to={kbScopedSettingsPath()}
            >
              {t("scoped_settings.nav_link")}
            </KbScopedNavLinkRow>
          </SidebarNavList>
        </SidebarGroupContent>
      </SidebarGroup>
    </nav>
  );
}
