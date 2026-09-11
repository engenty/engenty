// The run echoes the user's turn as
// a role:"user" TEXT_MESSAGE_* triple under the id the CLIENT assigned, so other
// windows on the same run can render the bubble. The client that SENT the message
// must never receive that echo — AG-UI's TEXT_MESSAGE_START means "begin a new
// message", so a spec-compliant client holding that id appends and doubles the
// user's own text. Confirmed against a stock @ag-ui/client HttpAgent.
// The literals below are deliberately partial — the predicate reads only `type`
// and `messageId`, and spelling out every required field of each event schema
// would obscure which field the case is actually about. Hence the double cast.
import { type AGUIEvent, EventType } from "@engenty/ag-ui-bridge";
import { describe, expect, it } from "vitest";
import { isUserTurnEchoFor } from "../thread-run-routes.js";

const OWN = "user-msg-own";

describe("isUserTurnEchoFor", () => {
  it("withholds the whole triple for the caller's own message id", () => {
    for (const type of [
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_END,
    ]) {
      expect(
        isUserTurnEchoFor({ messageId: OWN, type } as unknown as AGUIEvent, OWN)
      ).toBe(true);
    }
  });

  it("passes the assistant reply through", () => {
    // The whole point of the run — a different message id, never filtered.
    expect(
      isUserTurnEchoFor(
        {
          delta: "pong",
          messageId: "assistant-msg",
          type: EventType.TEXT_MESSAGE_CONTENT,
        } as unknown as unknown as AGUIEvent,
        OWN
      )
    ).toBe(false);
  });

  it("passes a DIFFERENT client's user turn through", () => {
    // Two windows on one thread: the other window's user bubble is exactly the
    // event this echo exists to deliver. Filtering on type alone would eat it.
    expect(
      isUserTurnEchoFor(
        {
          messageId: "user-msg-other",
          type: EventType.TEXT_MESSAGE_START,
        } as unknown as unknown as AGUIEvent,
        OWN
      )
    ).toBe(false);
  });

  it("does not filter non-text events that carry the same id", () => {
    expect(
      isUserTurnEchoFor(
        {
          messageId: OWN,
          type: EventType.TOOL_CALL_START,
        } as unknown as unknown as AGUIEvent,
        OWN
      )
    ).toBe(false);
  });

  it("filters nothing when the caller sent no user message id", () => {
    // A resume run carries no new user turn; null must not become a wildcard
    // that swallows every message whose id is likewise absent.
    expect(
      isUserTurnEchoFor(
        {
          messageId: undefined,
          type: EventType.TEXT_MESSAGE_START,
        } as unknown as unknown as AGUIEvent,
        null
      )
    ).toBe(false);
    expect(
      isUserTurnEchoFor(
        {
          messageId: OWN,
          type: EventType.TEXT_MESSAGE_START,
        } as unknown as unknown as AGUIEvent,
        null
      )
    ).toBe(false);
  });
});
