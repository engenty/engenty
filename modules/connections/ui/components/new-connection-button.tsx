import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@engenty/ui-core";
import { ConnectorLogoImg, connectorLogoSvg } from "@engenty/ui-icons";
import { Cable, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { CatalogConnector, ConnectionSharing } from "../api.js";
import { getConnectUrl } from "../api.js";

/**
 * "+ New connection" page action: pick a connector, then the sharing mode,
 * and jump straight into its OAuth flow (returning to `redirectTo`).
 */
export function NewConnectionButton({
  connectors,
  redirectTo,
  spaceId = null,
}: {
  connectors: Pick<CatalogConnector, "icon" | "id" | "name">[];
  redirectTo: string;
  /**
   * Mount what gets connected into this space (PLAN-spaces.md CN.4 Flow A).
   * Set when the user arrived here from a space's "Add account".
   */
  spaceId?: string | null;
}) {
  const { t } = useTranslation("connections");
  const [connecting, setConnecting] = useState(false);

  const connect = async (connectorId: string, sharing: ConnectionSharing) => {
    setConnecting(true);
    try {
      const { authUrl } = await getConnectUrl({
        connectorId,
        redirectTo,
        sharing,
        spaceId,
      });
      window.location.assign(authUrl);
    } catch (error) {
      setConnecting(false);
      toast.error(
        t("toasts.connectStartFailed", {
          error: error instanceof Error ? error.message : String(error),
        })
      );
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className="gap-1.5"
          disabled={connecting || connectors.length === 0}
          size="sm"
          type="button"
        >
          <Plus className="size-4" />
          {connecting ? t("catalog.connecting") : t("admin.newConnection")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {connectors.map((connector) => (
          <DropdownMenuSub key={connector.id}>
            <DropdownMenuSubTrigger className="gap-2">
              {connectorLogoSvg(connector.icon) ? (
                <ConnectorLogoImg
                  className="size-4 shrink-0 object-contain"
                  icon={connector.icon}
                  size={16}
                />
              ) : (
                <Cable
                  aria-hidden
                  className="size-4 shrink-0 text-muted-foreground"
                />
              )}
              {connector.name}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem
                onSelect={() => void connect(connector.id, "personal")}
              >
                {t("catalog.connectPersonal")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => void connect(connector.id, "org")}
              >
                {t("catalog.connectOrg")}
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
