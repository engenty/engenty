const STORAGE_KEY = "engenty.localFiles.installationId";

/**
 * A stable random id for this browser profile, persisted in localStorage. It
 * discriminates directory grants per browser-per-device (a handle granted in
 * one profile does not exist in another).
 */
export function installationId(): string {
  let id = "";
  try {
    id = localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    id = "";
  }
  if (!id) {
    id = crypto.randomUUID();
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Private mode: fall back to a per-session id (grants won't persist).
    }
  }
  return id;
}

/** A short human label for this browser/OS, shown on the connection. */
export function deviceLabel(): string {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Browser";
  const os = /Mac OS X/.test(ua)
    ? "macOS"
    : /Windows/.test(ua)
      ? "Windows"
      : /Linux/.test(ua)
        ? "Linux"
        : "";
  return os ? `${browser} · ${os}` : browser;
}
