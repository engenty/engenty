import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@engenty/ui-core";
import { ConnectorLogoImg, connectorLogoSvg } from "@engenty/ui-icons";
import { Cable, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { CatalogConnector } from "../api.js";
import { getConnectUrl } from "../api.js";
import { useConnectSpaceId } from "../hooks/use-connection-space.js";

/**
 * "+ New connection" page action: pick a connector and jump straight into
 * its OAuth flow (returning to `redirectTo`).
 */
export function NewConnectionButton({
  connectors,
  redirectTo,
  spaceId = null,
}: {
  connectors: Pick<CatalogConnector, "icon" | "id" | "name">[];
  redirectTo: string;
  /** The Space the new account belongs to; absent = personal Space. */
  spaceId?: string | null;
}) {
  const { t } = useTranslation("connections");
  const [connecting, setConnecting] = useState(false);
  const targetSpaceId = useConnectSpaceId(spaceId);

  const connect = async (connectorId: string) => {
    if (!targetSpaceId) {
      return;
    }
    setConnecting(true);
    try {
      const { authUrl } = await getConnectUrl({
        connectorId,
        redirectTo,
        spaceId: targetSpaceId,
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
          disabled={connecting || !targetSpaceId || connectors.length === 0}
          size="sm"
          type="button"
        >
          <Plus className="size-4" />
          {connecting ? t("catalog.connecting") : t("admin.newConnection")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {connectors.map((connector) => (
          <DropdownMenuItem
            className="gap-2"
            key={connector.id}
            onSelect={() => void connect(connector.id)}
          >
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
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
