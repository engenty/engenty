import type { ConnectorConnectButtonProps } from "@engenty/connections/ui/extensions";
import { useConnectSpaceId } from "@engenty/connections/ui/space";
import { useQueryClient } from "@engenty/query-client";
import { Button } from "@engenty/ui-core";
import { FolderPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  canGrantLocalFolder,
  grantLocalFolder,
} from "../lib/grant-local-folder.js";

const CATALOG_KEY = ["connections", "catalog"];

/**
 * Connect affordance for the browser-auth local-files connector: pick a folder
 * (File System Access API in the browser, native dialog in the desktop shell),
 * register it as a connection, and persist its handle/path locally so the
 * bridge can serve it.
 */
export function LocalFilesConnectButton({
  onConnected,
  spaceId = null,
}: ConnectorConnectButtonProps) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  // A folder belongs to a Space: this one, else the viewer's personal Space.
  const targetSpaceId = useConnectSpaceId(spaceId);

  if (!canGrantLocalFolder()) {
    return (
      <Button disabled size="sm" title="Requires Chrome or Edge" type="button">
        <FolderPlus className="mr-1.5 size-4" />
        Requires Chrome/Edge
      </Button>
    );
  }

  const connect = async () => {
    setBusy(true);
    try {
      if (!targetSpaceId) {
        return;
      }
      const granted = await grantLocalFolder({ spaceId: targetSpaceId });
      if (!granted) {
        return;
      }
      await queryClient.invalidateQueries({ queryKey: CATALOG_KEY });
      toast.success(`Connected "${granted.name}"`);
      await onConnected?.(granted.connectionId);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      toast.error(
        `Connect failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      disabled={busy}
      onClick={() => void connect()}
      size="sm"
      type="button"
    >
      <FolderPlus className="mr-1.5 size-4" />
      {busy ? "Connecting…" : "Connect folder"}
    </Button>
  );
}
