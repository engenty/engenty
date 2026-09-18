// Per-kind card bodies contributed by the module that owns the kind.
//
// The package owns the list; a module owns what its own kinds can DO — the
// tasks module renders approve/deny for `tool_approval`, a module with its
// own kinds renders whatever they need. A kind with no renderer shows its
// summary and deep link only, so a tenant without that module still sees
// the record.
import {
  type ComponentType,
  createContext,
  type ReactNode,
  useContext,
  useSyncExternalStore,
} from "react";
import type { NotificationDto } from "./api.js";

export type NotificationSurface = "page" | "inbox";

export const NotificationSurfaceContext =
  createContext<NotificationSurface>("page");

export function useNotificationSurface(): NotificationSurface {
  return useContext(NotificationSurfaceContext);
}

export interface NotificationRendererProps {
  notification: NotificationDto;
}

export type NotificationRenderer = ComponentType<NotificationRendererProps>;

const renderers = new Map<string, NotificationRenderer>();
const listeners = new Set<() => void>();
let version = 0;

function notify() {
  version += 1;
  for (const listener of listeners) {
    listener();
  }
}

/** Register the body rendered under a notification of `kind`. Returns undo. */
export function registerNotificationRenderer(
  kind: string,
  renderer: NotificationRenderer
): () => void {
  renderers.set(kind, renderer);
  notify();
  return () => {
    if (renderers.get(kind) === renderer) {
      renderers.delete(kind);
      notify();
    }
  };
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useNotificationRenderer(
  kind: string
): NotificationRenderer | null {
  useSyncExternalStore(
    subscribe,
    () => version,
    () => version
  );
  return renderers.get(kind) ?? null;
}

export function NotificationBody({
  notification,
}: NotificationRendererProps): ReactNode {
  const Renderer = useNotificationRenderer(notification.kind);
  return Renderer ? <Renderer notification={notification} /> : null;
}
