type EventKey<T> = Extract<keyof T, string>;

/**
 * A UI event handler. Return nothing to **observe** the event; return a payload
 * to **transform** it for downstream handlers. This single shape unifies the
 * former action (observe) and filter (transform) primitives.
 */
export type EventHandler<TPayload> = (
  payload: TPayload
) => TPayload | undefined | Promise<TPayload | undefined>;

export function createHookEngine<TEvents extends Record<string, unknown>>() {
  const handlers = new Map<EventKey<TEvents>, EventHandler<unknown>[]>();

  const on = <TEvent extends EventKey<TEvents>>(
    event: TEvent,
    handler: EventHandler<TEvents[TEvent]>
  ) => {
    const current = handlers.get(event) ?? [];
    current.push(handler as EventHandler<unknown>);
    handlers.set(event, current);
  };

  /**
   * Run every handler for `event` in registration order, threading the payload
   * through: a handler that returns a value replaces the payload for the next
   * handler (filter), while a handler that returns nothing leaves it untouched
   * (observer). Returns the final payload.
   */
  const emit = async <TEvent extends EventKey<TEvents>>(
    event: TEvent,
    payload: TEvents[TEvent]
  ): Promise<TEvents[TEvent]> => {
    let next = payload as unknown;
    for (const handler of handlers.get(event) ?? []) {
      const result = await (handler as EventHandler<unknown>)(next);
      if (result !== undefined) {
        next = result;
      }
    }
    return next as TEvents[TEvent];
  };

  return {
    on,
    emit,
  };
}
