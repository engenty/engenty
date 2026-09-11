import { useTranslation } from "@engenty/i18n/ui";
import { SidebarNavList } from "@engenty/ui-core";
import { Settings } from "lucide-react";
import { SidebarNavRow } from "./projects-sidebar-header.js";

interface ProjectsSidebarFooterProps {
  pathname: string;
}

export function ProjectsSidebarFooter({
  pathname,
}: ProjectsSidebarFooterProps) {
  const { t } = useTranslation("projects");

  return (
    <div className="shrink-0 border-border-soft border-t pt-2 pr-1 pb-2">
      <SidebarNavList>
        <SidebarNavRow
          active={pathname === "/mdl/projects/settings"}
          icon={Settings}
          label={t("menu.settings")}
          to="/mdl/projects/settings"
        />
      </SidebarNavList>
    </div>
  );
}
