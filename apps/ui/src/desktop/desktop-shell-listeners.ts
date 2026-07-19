/**
 * Shell-level listeners for the desktop app. Installed from `main.tsx` for
 * every desktop launch (before auth), so they work on the server picker and
 * login screens too. Tauri APIs are imported dynamically so the web bundle
 * only ships a lazy chunk reference.
 */

import { clearStoredDesktopServer, isDesktopShell } from "./desktop-runtime";

/** Tray menu "Change Server…" (see src-tauri/src/lib.rs). */
const CHANGE_SERVER_EVENT = "engenty-desktop:change-server";

/**
 * The desktop shell has no dev console for users, so a crash in the SPA
 * would otherwise be an unexplainable white window. Surface uncaught
 * errors/rejections as a visible overlay with the message + stack.
 */
function installDesktopErrorOverlay(): void {
  const show = (title: string, detail: string) => {
    let el = document.getElementById("desktop-error-overlay");
    if (!el) {
      el = document.createElement("div");
      el.id = "desktop-error-overlay";
      el.style.cssText =
        "position:fixed;bottom:0;left:0;right:0;max-height:45vh;overflow:auto;" +
        "background:#7f1d1d;color:#fff;font:12px/1.5 ui-monospace,monospace;" +
        "padding:12px 16px;z-index:2147483647;white-space:pre-wrap;";
      document.body.appendChild(el);
    }
    const entry = document.createElement("div");
    entry.textContent = `[${title}] ${detail}`;
    el.appendChild(entry);
  };
  window.addEventListener("error", (event) => {
    show(
      "error",
      `${event.message}\n  at ${event.filename}:${event.lineno}:${event.colno}\n${event.error?.stack ?? ""}`
    );
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    show(
      "unhandledrejection",
      reason instanceof Error
        ? `${reason.message}\n${reason.stack ?? ""}`
        : String(reason)
    );
  });
}

export function installDesktopShellListeners(): void {
  if (!isDesktopShell()) {
    return;
  }
  installDesktopErrorOverlay();
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
