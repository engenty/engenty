// Where a turn was said, kept on the message that said it.
//
// A thread's `route_context` is overwritten at the start of every run with the
// page the person is standing on, so the thread only ever knows where its LAST
// turn happened. One infinite conversation with the copilot (the river) needs
// every turn to remember its own place: chapters are cut where the space or the
// day changes, and "what did we talk about in engrd on Tuesday" is a query over
// exactly this — not over anything the thread row still holds.
//
// Written under `thread_message.metadata.context` for the user turn of a run,
// by both writers of that row (memory's flush and the teardown rescue), from the
// same route context the run resolved its space with.
import { spaceIdFromRouteContext } from "../sessions/session-identity.js";

export const MESSAGE_CONTEXT_KEY = "context";

export interface TurnContext {
  module_id: string | null;
  pathname: string | null;
  route_key: string | null;
  space_id: string | null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * The turn's place, read off the route context the client sends with the run
 * (`CopilotRouteContext`: `moduleId`, `routeKey`, `pathname`, `scope.space_id`).
 * `null` when the run carried no place at all — a turn from a lane with no UI
 * behind it — so nothing is stamped rather than four nulls.
 */
export function turnContextFromRouteContext(
  routeContext: Record<string, unknown> | null | undefined
): TurnContext | null {
  if (!routeContext) {
    return null;
  }
  const context: TurnContext = {
    module_id: nonEmptyString(routeContext.moduleId),
    pathname: nonEmptyString(routeContext.pathname),
    route_key: nonEmptyString(routeContext.routeKey),
    space_id: spaceIdFromRouteContext(routeContext),
  };
  return Object.values(context).some((value) => value !== null)
    ? context
    : null;
}

/** The message metadata patch for a user turn, or nothing when there is no place. */
export function turnContextMetadata(
  context: TurnContext | null | undefined
): Record<string, unknown> {
  return context ? { [MESSAGE_CONTEXT_KEY]: context } : {};
}
