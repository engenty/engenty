// Inbox URLs. One builder so the rail, the space bell and a space card
// cannot disagree about `/notifications` vs `/s/<key>/notifications`.

export const NOTIFICATIONS_PATH = "/notifications";

export function spaceInboxPath(spaceKey: string): string {
  return `/s/${encodeURIComponent(spaceKey)}${NOTIFICATIONS_PATH}`;
}

/** `/s/<key>/…` → the key, or null when the URL is not a space route. */
export function spaceKeyFromPathname(pathname: string): string | null {
  const path = pathname.split(/[?#]/, 1)[0] ?? pathname;
  const match = /^\/s\/([^/]+)/.exec(path);
  const raw = match?.[1];
  if (!raw) {
    return null;
  }
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
