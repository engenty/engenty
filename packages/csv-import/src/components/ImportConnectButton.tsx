import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@engenty/ui-core";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import {
  type ConnectionSharing,
  getConnectUrl,
} from "../connection-import-api.js";

export interface ImportConnectButtonProps {
  connectingLabel: string;
  connectLabel: string;
  connectOrgLabel: string;
  connectorId: string;
  connectPersonalLabel: string;
  onError?: (message: string) => void;
  redirectTo: string;
}

/** OAuth connect affordance for the import source picker (same HTTP as connections UI). */
export function ImportConnectButton({
  connectLabel,
  connectingLabel,
  connectOrgLabel,
  connectPersonalLabel,
  connectorId,
  onError,
  redirectTo,
}: ImportConnectButtonProps) {
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
      onError?.(
        error instanceof Error ? error.message : "Failed to start connect"
      );
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button disabled={connecting} size="sm" type="button" variant="outline">
          {connecting ? connectingLabel : connectLabel}
          <ChevronDown className="ml-1 size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => void connect("personal")}>
          {connectPersonalLabel}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void connect("org")}>
          {connectOrgLabel}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
