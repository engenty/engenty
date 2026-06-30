import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@engenty/ui-core";
import { Copy, ExternalLink, Eye, Link2, Settings, Users } from "lucide-react";

interface ProjectDetailPageActionsProps {
  onCopyLink: () => void;
  onCopyLinkClick: (e: React.MouseEvent) => void;
  onOpenPortalSettings: () => void;
  onOpenProjectSettings: () => void;
  onPortalDropdownOpenChange: (open: boolean) => void;
  onViewModeChange: (mode: "internal" | "external") => void;
  portalDropdownOpen: boolean;
  portalEnabled: boolean;
  portalUrl: string;
  viewMode: "internal" | "external";
}

export function ProjectDetailPageActions({
  portalEnabled,
  portalUrl,
  viewMode,
  onViewModeChange,
  onCopyLinkClick,
  onCopyLink,
  onOpenPortalSettings,
  onOpenProjectSettings,
  portalDropdownOpen,
  onPortalDropdownOpenChange,
}: ProjectDetailPageActionsProps) {
  const { t } = useTranslation("projects");

  return (
    <div className="flex items-center gap-2">
      {portalEnabled ? (
        <Tabs
          className="w-auto"
          onValueChange={(v) => onViewModeChange(v as "internal" | "external")}
          value={viewMode}
        >
          <TabsList className="h-8 p-[2px]">
            <TabsTrigger
              className="h-full gap-1.5 px-2 text-xs"
              value="internal"
            >
              <Users className="h-3 w-3" />
              Admin
            </TabsTrigger>
            <TabsTrigger
              className="h-full gap-1.5 px-2 text-xs"
              value="external"
            >
              <Eye className="h-3 w-3" />
              Public
            </TabsTrigger>
          </TabsList>
        </Tabs>
      ) : null}

      {portalEnabled && (
        <DropdownMenu
          onOpenChange={onPortalDropdownOpenChange}
          open={portalDropdownOpen}
        >
          <DropdownMenuTrigger asChild>
            <Button
              className="h-8 w-8 p-0 text-green-600"
              onClick={onCopyLinkClick}
              onContextMenu={(e) => {
                e.preventDefault();
                onPortalDropdownOpenChange(true);
              }}
              size="sm"
              title="Copy Portal Link (Right-click for menu)"
              variant="outline"
            >
              <Link2 className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <DropdownMenuItem onClick={onCopyLink}>
              <Copy className="mr-2 h-4 w-4" />
              Copy link
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                window.open(portalUrl, "_blank", "noopener,noreferrer")
              }
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Open in new window
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => (window.location.href = portalUrl)}
            >
              <Link2 className="mr-2 h-4 w-4" />
              Go to portal
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <Button
        className="h-8 w-8 p-0"
        onClick={onOpenProjectSettings}
        size="sm"
        title={t("detail.portal.settings")}
        variant="outline"
      >
        <Settings className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
