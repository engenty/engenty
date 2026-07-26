/**
 * OpenAI refuses `response.create` while a response is already in flight
 * ("conversation_already_has_active_response"). The gate tracks the in-flight
 * state from the raw event stream and defers a refused request to the next
 * `response.done` instead of dropping the assistant turn.
 */

export interface OpenAiResponseGate {
  /** Bind the client-event sender once the connection exists. */
  attach: (send: (event: unknown) => void) => void;
  /** Feed every raw OpenAI event so the gate can track response state. */
  observe: (event: unknown) => void;
  /** Ask for an assistant turn now, or queue it until the current one ends. */
  request: () => void;
  reset: () => void;
}

function isEventType(event: unknown, type: string): boolean {
  return (
    event !== null &&
    typeof event === "object" &&
    "type" in event &&
    event.type === type
  );
}

export function createOpenAiResponseGate(): OpenAiResponseGate {
  let send: ((event: unknown) => void) | null = null;
  let active = false;
  let queued = false;

  const request = () => {
    if (!send) {
      return;
    }
    if (active) {
      queued = true;
      return;
    }
    try {
      send({ type: "response.create" });
    } catch {
      // Data channel not open — drop the request silently.
    }
  };

  return {
    attach: (sender) => {
      send = sender;
    },
    observe: (event) => {
      if (isEventType(event, "response.created")) {
        active = true;
        return;
      }
      if (isEventType(event, "response.done")) {
        active = false;
        if (queued) {
          queued = false;
          request();
        }
      }
    },
    request,
    reset: () => {
      active = false;
      queued = false;
    },
  };
}
