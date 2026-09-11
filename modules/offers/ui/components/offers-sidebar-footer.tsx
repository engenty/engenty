import { useTranslation } from "@engenty/i18n/ui";
import { SidebarNavList } from "@engenty/ui-core";
import { Settings } from "lucide-react";
import { SidebarNavRow } from "./offers-sidebar-header.js";

interface OffersSidebarFooterProps {
  pathname: string;
}

export function OffersSidebarFooter({ pathname }: OffersSidebarFooterProps) {
  const { t } = useTranslation("offers");

  return (
    <div className="shrink-0 border-border-soft border-t pt-2 pr-1 pb-2">
      <SidebarNavList>
        <SidebarNavRow
          active={pathname === "/mdl/offers/settings"}
          icon={Settings}
          label={t("menu.settings", { defaultValue: "Settings" })}
          to="/mdl/offers/settings"
        />
      </SidebarNavList>
    </div>
  );
}
