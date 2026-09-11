import { isDesktopShell, listDesktopDirectoryKeys } from "./desktop-fs.js";
import { listHandleKeys } from "./handle-store.js";

/** True when this browser/desktop profile actually holds a granted folder. */
export async function hasServableLocalFolder(): Promise<boolean> {
  if (isDesktopShell()) {
    return listDesktopDirectoryKeys().length > 0;
  }
  const keys = await listHandleKeys();
  return keys.length > 0;
}
