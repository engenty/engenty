/**
 * Shell-level listeners for the desktop app. Installed from `main.tsx` for
 * every desktop launch (before auth), so they work on the server picker and
 * login screens too. Tauri APIs are imported dynamically so the web bundle
 * only ships a lazy chunk reference.
 */

import { clearStoredDesktopServer, isDesktopShell } from "./desktop-runtime";

/** Tray menu "Change Server…" (see src-tauri/src/lib.rs). */
const CHANGE_SERVER_EVENT = "engenty-desktop:change-server";

export function installDesktopShellListeners(): void {
  if (!isDesktopShell()) {
    return;
  }
  void (async () => {
    try {
      const { listen } = await import("@tauri-apps/api/event");
      await listen(CHANGE_SERVER_EVENT, () => {
        clearStoredDesktopServer();
        window.location.reload();
      });
    } catch (error) {
      console.warn("[desktop] failed to install shell listeners", error);
    }
  })();
}
