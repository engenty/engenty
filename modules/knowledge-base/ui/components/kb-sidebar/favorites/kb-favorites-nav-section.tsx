/**
 * Compact favorites section for the shell secondary column.
 * Standalone mode (module overview): labeled block above nav when items exist.
 * Embedded mode (KB sidebar favorites tab): full panel with empty state.
 */

import { canonicalModulePathname } from "@engenty/ai-core/browser";
import { shellSecondaryNavItemProps } from "@engenty/app-shell";
import { matchesPath } from "@engenty/app-shell/navigation";
import { useTranslation } from "@engenty/i18n/ui";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarRow,
  SidebarRowButton,
  SidebarRowLeadingIcon,
  SidebarSectionLabel,
} from "@engenty/ui-core";
import { FileText, HelpCircle } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useKbFavoritesNavQuery } from "../../../favorites-nav-queries.js";

function favoriteNavLeadingIconForTo(to: string) {
  return to.includes("/faqs/") ? HelpCircle : FileText;
}

interface KbFavoritesNavSectionProps {
  /** Hides section label; shows empty hint when there are no favorites. */
  embedded?: boolean;
}

export function KbFavoritesNavSection({
  embedded = false,
}: KbFavoritesNavSectionProps = {}) {
  const { t } = useTranslation("kb");
  const { data: doc } = useKbFavoritesNavQuery();
  // Canonical, not raw: in a space this is `/s/<key>/kb/…`, and
  // every matcher below is written against `/mdl/knowledge-base/…`.
  const { pathname: rawPathname, search } = useLocation();
  const pathname = canonicalModulePathname(rawPathname);

  const items = doc?.items ?? [];
  if (items.length === 0) {
    if (embedded) {
      return (
        <p className="py-1.5 text-muted-foreground text-xs">
          {t("favorites.empty")}
        </p>
      );
    }
    return null;
  }

  const list = (
    <SidebarMenu className="gap-0.5">
      {items.map((item) => {
        const LeadingIcon = favoriteNavLeadingIconForTo(item.to);
        const isActive = matchesPath(pathname, search, item.to);
        return (
          <SidebarRow isActive={isActive} key={item.to}>
            <SidebarRowLeadingIcon icon={<LeadingIcon aria-hidden />} />
            <SidebarRowButton asChild isActive={isActive}>
              <Link
                title={item.subtitle ?? undefined}
                to={item.to}
                {...shellSecondaryNavItemProps}
              >
                <span className="truncate">{item.title}</span>
              </Link>
            </SidebarRowButton>
          </SidebarRow>
        );
      })}
    </SidebarMenu>
  );

  if (embedded) {
    return list;
  }

  return (
    <SidebarGroup className="shrink-0 p-0 pb-1">
      <SidebarSectionLabel align="root">
        {t("favorites.nav_link")}
      </SidebarSectionLabel>
      <SidebarGroupContent>{list}</SidebarGroupContent>
    </SidebarGroup>
  );
}
