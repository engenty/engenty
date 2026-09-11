// Events this process raises about its own records.
//
// Modules raise theirs on core's plugin bus, and the routine event bridge
// carries those across to `POST /ai/v1/routines/events`. Records that live in
// apps/ai — Space tables today — have no plugin, so their events are raised
// here and reach the same dispatcher in-process. One bus per process; the
// subscriber set is tiny (the routine dispatcher), so a Set of listeners is
// the whole implementation.
//
// An emit never throws into the write path: the row is already written, and a
// listener that fails is its own problem to log.

export interface AppEvent {
  payload: Record<string, unknown>;
  /** Event name in the `<owner>.<entity>.<verb>` form module events use. */
  resource: string;
  tenantId: string;
}

export type AppEventListener = (event: AppEvent) => void | Promise<void>;

const listeners = new Set<AppEventListener>();

export function onAppEvent(listener: AppEventListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitAppEvent(event: AppEvent): void {
  for (const listener of listeners) {
    try {
      const result = listener(event);
      if (result && typeof (result as Promise<void>).catch === "function") {
        (result as Promise<void>).catch((error: unknown) => {
          console.warn(`[app-events] listener rejected for ${event.resource}`, {
            message: error instanceof Error ? error.message : String(error),
          });
        });
      }
    } catch (error) {
      console.warn(`[app-events] listener threw for ${event.resource}`, {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/** @internal test seam */
export function resetAppEventListenersForTests(): void {
  listeners.clear();
}
