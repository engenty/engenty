import { useQueryClient } from "@engenty/query-client";
import { Button } from "@engenty/ui-core";
import { FolderPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { registerDirectory } from "../api.js";
import { isSupported, pickDirectory } from "../lib/fsa.js";
import { putHandle } from "../lib/handle-store.js";
import { deviceLabel, installationId } from "../lib/installation.js";

const CATALOG_KEY = ["connections", "catalog"];

/**
 * Connect affordance for the browser-auth local-files connector: pick a folder
 * with the File System Access API, register it as a connection, and persist its
 * handle locally so the bridge can serve it.
 */
export function LocalFilesConnectButton() {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const supported = isSupported();

  if (!supported) {
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
      const handle = await pickDirectory();
      const { connection_id } = await registerDirectory({
        deviceLabel: deviceLabel(),
        directoryName: handle.name,
        installationId: installationId(),
      });
      try {
        await putHandle(connection_id, handle);
      } catch (storeError) {
        toast.error(
          `Could not persist the folder handle: ${
            storeError instanceof Error
              ? storeError.message
              : String(storeError)
          }`
        );
      }
      await queryClient.invalidateQueries({ queryKey: CATALOG_KEY });
      toast.success(`Connected "${handle.name}"`);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return; // user cancelled the picker
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
