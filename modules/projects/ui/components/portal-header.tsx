import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { LogOut } from "lucide-react";
import { clearPortalVerified } from "./portal-login.js";

interface PortalHeaderProps {
  onLogout?: () => void;
  projectId: string;
  projectTitle: string;
}

export function PortalHeader({
  projectId,
  projectTitle,
  onLogout,
}: PortalHeaderProps) {
  const { t } = useTranslation("projects");

  const handleLogout = () => {
    clearPortalVerified(projectId);
    onLogout?.();
  };

  return (
    <header className="flex items-center justify-between border-b bg-card px-4 py-3">
      <h1 className="font-semibold text-lg">{projectTitle}</h1>
      <Button
        onClick={handleLogout}
        size="sm"
        title={t("portal.logout")}
        variant="ghost"
      >
        <LogOut className="mr-1 h-4 w-4" />
        {t("portal.logout")}
      </Button>
    </header>
  );
}
