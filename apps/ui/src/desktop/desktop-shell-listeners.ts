/**
 * Shell-level listeners for the desktop app. Installed from `main.tsx` for
 * every desktop launch (before auth), so they work on the server picker and
 * login screens too. Tauri APIs are imported dynamically so the web bundle
 * only ships a lazy chunk reference.
 */

import { clearStoredDesktopServer, isDesktopShell } from "./desktop-runtime";

/** Tray menu "Change Server…" (see src-tauri/src/lib.rs). */
const CHANGE_SERVER_EVENT = "engenty-desktop:change-server";
/** Tray menu "Reload" (see src-tauri/src/lib.rs). */
const RELOAD_EVENT = "engenty-desktop:reload";

/**
 * Transient connectivity failures are already handled by the app's own
 * retry/unavailable states — don't paint them into the crash overlay.
 */
function isTransientNetworkError(detail: string): boolean {
  return /lost connection|api is reachable|failed to fetch|networkerror|load failed|abort/i.test(
    detail
  );
}

/**
 * The desktop shell has no dev console for users, so a crash in the SPA
 * would otherwise be an unexplainable white window. Surface uncaught
 * errors/rejections as a dismissible overlay with the message + stack.
 */
function installDesktopErrorOverlay(): void {
  const seen = new Set<string>();
  const show = (title: string, detail: string) => {
    if (isTransientNetworkError(detail)) {
      return;
    }
    const key = detail.slice(0, 200);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    let el = document.getElementById("desktop-error-overlay");
    if (!el) {
      el = document.createElement("div");
      el.id = "desktop-error-overlay";
      el.style.cssText =
        "position:fixed;bottom:0;left:0;right:0;max-height:45vh;overflow:auto;" +
        "background:#7f1d1d;color:#fff;font:12px/1.5 ui-monospace,monospace;" +
        "padding:12px 40px 12px 16px;z-index:2147483647;white-space:pre-wrap;";
      const close = document.createElement("button");
      close.textContent = "✕";
      close.style.cssText =
        "position:absolute;top:8px;right:12px;background:none;border:none;" +
        "color:#fff;font-size:16px;cursor:pointer;";
      close.addEventListener("click", () => {
        el?.remove();
        seen.clear();
      });
      el.appendChild(close);
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

/** ⌘R / Ctrl+R reloads the SPA — the shell has no browser chrome for it. */
function installReloadShortcut(): void {
  window.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "r") {
      event.preventDefault();
      window.location.reload();
    }
  });
}

export function installDesktopShellListeners(): void {
  if (!isDesktopShell()) {
    return;
  }
  installDesktopErrorOverlay();
  installReloadShortcut();
  void (async () => {
    try {
      const { listen } = await import("@tauri-apps/api/event");
      await listen(CHANGE_SERVER_EVENT, () => {
        clearStoredDesktopServer();
        window.location.reload();
      });
      await listen(RELOAD_EVENT, () => {
        window.location.reload();
      });
    } catch (error) {
      console.warn("[desktop] failed to install shell listeners", error);
    }
  })();
}
