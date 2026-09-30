// Who a card is from, as a face and a name: the agent's own portrait and
// display name when the host knows it (apps/ui registers both over its
// roster), else the kind's glyph in a round tile — like an app icon on a
// macOS banner — and the label the server stamped. Registered once, read by
// every surface (bell, banner, dashboard) so they say the same thing.
import { cn } from "@engenty/ui-core";
import {
  type ComponentType,
  type ReactNode,
  useSyncExternalStore,
} from "react";
import type { NotificationDto } from "./api.js";
import { iconForKind } from "./notification-text.js";

export interface NotificationFaceProps {
  notification: NotificationDto;
  size: number;
}

/** Returns null when it has no face for the record — the glyph stands in. */
export type NotificationFaceRenderer = ComponentType<
  NotificationFaceProps & { fallback: ReactNode }
>;

/**
 * The agent's display name for a record, or null to keep the server's
 * label. A hook: the host reads its roster query. Registered once at boot,
 * never swapped while cards are mounted.
 */
export type NotificationActorNameHook = (
  notification: NotificationDto
) => string | null;

let actorNameHook: NotificationActorNameHook = () => null;

export function registerNotificationActorName(
  hook: NotificationActorNameHook
): void {
  actorNameHook = hook;
}

const AGENT_KEY = /^[a-z0-9]+(?:[._-][a-z0-9]+)+$/;

/**
 * A label that is an agent key (`offers.manager` — a module agent the
 * server could not name) said as words: "Offers Manager". Never an id on a
 * card.
 */
export function readableActorLabel(label: string): string {
  const trimmed = label.trim();
  if (!AGENT_KEY.test(trimmed)) {
    return trimmed;
  }
  return trimmed
    .split(/[._-]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** The name a card says: the host's display name, else the stamped label. */
export function useNotificationActorName(
  notification: NotificationDto
): string | null {
  const known = actorNameHook(notification);
  const label = notification.metadata?.actor_label;
  if (known) {
    return known;
  }
  return typeof label === "string" && label.trim()
    ? readableActorLabel(label)
    : null;
}

let renderer: NotificationFaceRenderer | null = null;
const listeners = new Set<() => void>();
let version = 0;

export function registerNotificationFace(
  next: NotificationFaceRenderer
): () => void {
  renderer = next;
  version += 1;
  for (const listener of listeners) {
    listener();
  }
  return () => {
    if (renderer === next) {
      renderer = null;
      version += 1;
      for (const listener of listeners) {
        listener();
      }
    }
  };
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function NotificationFace({
  notification,
  size,
}: NotificationFaceProps) {
  useSyncExternalStore(
    subscribe,
    () => version,
    () => version
  );
  const Icon = iconForKind(notification);
  const alert = notification.class === "alert";
  const fallback = (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full",
        alert
          ? "bg-destructive/10 text-destructive"
          : "bg-muted text-muted-foreground"
      )}
      style={{ height: size, width: size }}
    >
      <Icon className="size-[45%]" />
    </span>
  );
  const Face = renderer;
  return Face ? (
    <Face fallback={fallback} notification={notification} size={size} />
  ) : (
    fallback
  );
}
