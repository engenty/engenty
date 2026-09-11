// Inbox URLs. One builder so the rail, the space bell and a space card
// cannot disagree about `/notifications` vs `/s/<key>/notifications`.

export const NOTIFICATIONS_PATH = "/notifications";

export function spaceInboxPath(spaceKey: string): string {
  return `/s/${encodeURIComponent(spaceKey)}${NOTIFICATIONS_PATH}`;
}
