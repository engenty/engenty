import { Button } from "@engenty/ui-core";
import { useState } from "react";
import { getConnectUrl } from "../connection-import-api.js";

export interface ImportConnectButtonProps {
  connectingLabel: string;
  connectLabel: string;
  connectorId: string;
  onError?: (message: string) => void;
  redirectTo: string;
}

/** OAuth connect affordance for the import source picker (same HTTP as connections UI). */
export function ImportConnectButton({
  connectLabel,
  connectingLabel,
  connectorId,
  onError,
  redirectTo,
}: ImportConnectButtonProps) {
  const [connecting, setConnecting] = useState(false);

  const connect = async () => {
    setConnecting(true);
    try {
      const { authUrl } = await getConnectUrl({
        connectorId,
        redirectTo,
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
    <Button
      disabled={connecting}
      onClick={() => void connect()}
      size="sm"
      type="button"
      variant="outline"
    >
      {connecting ? connectingLabel : connectLabel}
    </Button>
  );
}
