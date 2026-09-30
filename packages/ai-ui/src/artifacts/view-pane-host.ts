import { openViewPaneTab } from "./artifact-store.js";

/**
 * The desks currently showing the end-pane column, most recent last. A desk
 * registers while it is mounted and visible (a hidden, kept-alive desk runs no
 * effects, so it is not listed). `open_view` lands in the newest one; with none
 * listed the page opens as the main content instead.
 */
const hosts: string[] = [];

export function registerViewPaneHost(hostKey: string): () => void {
  hosts.push(hostKey);
  return () => {
    const at = hosts.lastIndexOf(hostKey);
    if (at !== -1) {
      hosts.splice(at, 1);
    }
  };
}

/** The host `open_view` would land in, or null when no desk is showing. */
export function activeViewPaneHost(): string | null {
  return hosts.at(-1) ?? null;
}

/**
 * Open `path` in the View Pane of the visible desk. Returns that desk's host
 * key, or null when there is no desk to hold it.
 */
export function openViewInPane(
  view: { path: string; title?: string },
  opts?: { expanded?: boolean }
): string | null {
  const hostKey = activeViewPaneHost();
  if (!hostKey) {
    return null;
  }
  openViewPaneTab(hostKey, view, opts);
  return hostKey;
}
