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
} from "@engenty/ui-core";
import { Settings } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { TEAM_MODULE_SETTINGS_PATH } from "../team-paths.js";

export function TeamModuleScopedNavLinks() {
  const { t } = useTranslation("team");
  const { pathname, search } = useLocation();
  const settingsTo = TEAM_MODULE_SETTINGS_PATH;
  const isActive = matchesPath(pathname, search, settingsTo);

  return (
    <nav
      aria-label={t("sidebar.settings_nav_aria")}
      className="shrink-0 border-border-soft border-t pt-2 pb-2"
    >
      <SidebarGroup className="p-0">
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarRow isActive={isActive}>
              <SidebarRowLeadingIcon icon={<Settings aria-hidden />} />
              <SidebarRowButton asChild isActive={isActive} size="sm">
                <Link to={settingsTo} {...shellSecondaryNavItemProps}>
                  <span className="truncate">
                    {t("sidebar.module_settings")}
                  </span>
                </Link>
              </SidebarRowButton>
            </SidebarRow>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </nav>
  );
}
