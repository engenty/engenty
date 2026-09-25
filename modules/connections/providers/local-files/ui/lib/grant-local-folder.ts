/**
 * Pick a local directory and register it as a connection.
 *
 * Shared by the tenant Connections "Connect folder" button and the space
 * Files "Connect folder" dialog, so granting from inside a space does not
 * require a detour through tenant settings.
 */
import { toast } from "sonner";
import { registerDirectory } from "../api.js";
import { notifyLocalFolderGranted } from "./bridge-session.js";
import {
  directoryDisplayName,
  isDesktopShell,
  pickDesktopDirectory,
  putDesktopDirectoryPath,
  getDesktopDirectoryPath as readDesktopDirectoryPath,
} from "./desktop-fs.js";
import { isSupported, pickDirectory } from "./fsa.js";
import { putHandle } from "./handle-store.js";
import { deviceLabel, installationId } from "./installation.js";

export function getDesktopDirectoryPath(connectionId: string): string | null {
  return readDesktopDirectoryPath(connectionId);
}

export function canGrantLocalFolder(): boolean {
  return isDesktopShell() || isSupported();
}

export async function grantLocalFolder(options: {
  /** The Space the folder connection will belong to. */
  spaceId: string;
}): Promise<{ connectionId: string; name: string } | null> {
  const name = isDesktopShell()
    ? await grantDesktop(options.spaceId)
    : await grantBrowser(options.spaceId);
  return name;
}

async function grantDesktop(
  spaceId: string
): Promise<{ connectionId: string; name: string } | null> {
  const path = await pickDesktopDirectory();
  if (!path) {
    return null;
  }
  const name = directoryDisplayName(path);
  const { connection_id } = await registerDirectory({
    deviceLabel: deviceLabel(),
    directoryName: name,
    installationId: installationId(),
    spaceId,
  });
  putDesktopDirectoryPath(connection_id, path);
  notifyLocalFolderGranted();
  return { connectionId: connection_id, name };
}

async function grantBrowser(
  spaceId: string
): Promise<{ connectionId: string; name: string } | null> {
  const handle = await pickDirectory();
  const { connection_id } = await registerDirectory({
    deviceLabel: deviceLabel(),
    directoryName: handle.name,
    installationId: installationId(),
    spaceId,
  });
  try {
    await putHandle(connection_id, handle);
  } catch (storeError) {
    toast.error(
      `Could not persist the folder handle: ${
        storeError instanceof Error ? storeError.message : String(storeError)
      }`
    );
  }
  notifyLocalFolderGranted();
  return { connectionId: connection_id, name: handle.name };
}
