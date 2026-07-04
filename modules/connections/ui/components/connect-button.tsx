import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@engenty/ui-core";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { ConnectionSharing } from "../api.js";
import { getConnectUrl } from "../api.js";

export interface ConnectButtonProps {
  connectorId: string;
  /** Connections already exist — label the button "Add account" instead. */
  hasConnections?: boolean;
  /** Same-app path the OAuth callback returns to (`?connected=1` / `?error=`). */
  redirectTo: string;
  size?: "sm" | "default";
  variant?: "default" | "outline";
}

/**
 * Starts the OAuth flow: fetches the provider auth URL and redirects the
 * browser there. The dropdown chooses the sharing mode of the new connection.
 */
export function ConnectButton({
  connectorId,
  hasConnections = false,
  redirectTo,
  size = "sm",
  variant = "default",
}: ConnectButtonProps) {
  const { t } = useTranslation("connections");
  const [connecting, setConnecting] = useState(false);

  const connect = async (sharing: ConnectionSharing) => {
    setConnecting(true);
    try {
      const { authUrl } = await getConnectUrl({
        connectorId,
        redirectTo,
        sharing,
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
          disabled={connecting}
          size={size}
          type="button"
          variant={variant}
        >
          {connecting
            ? t("catalog.connecting")
            : hasConnections
              ? t("catalog.addAccount")
              : t("catalog.connect")}
          <ChevronDown className="ml-1 h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => void connect("personal")}>
          {t("catalog.connectPersonal")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void connect("org")}>
          {t("catalog.connectOrg")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
