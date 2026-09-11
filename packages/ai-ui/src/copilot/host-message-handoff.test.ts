/**
 * @vitest-environment happy-dom
 */

import { afterEach, describe, expect, it } from "vitest";
import { ENGENTY_COPILOT_HOST_KEY } from "../agent-provider/host-keys.js";
import {
  clearPendingHostMessage,
  HOST_MESSAGE_HANDOFF_STATE,
  pendingHostMessageFromState,
  readPendingHostMessage,
  resolvePendingHostMessage,
  writePendingHostMessage,
} from "./host-message-handoff.js";

describe("pendingHostMessageFromState", () => {
  it("preserves the exact non-empty message from router state", () => {
    expect(
      pendingHostMessageFromState({
        [HOST_MESSAGE_HANDOFF_STATE]: "  hello\nthere  ",
      })
    ).toBe("  hello\nthere  ");
  });

  it("ignores empty or unrelated state", () => {
    expect(pendingHostMessageFromState(null)).toBeNull();
    expect(pendingHostMessageFromState({})).toBeNull();
    expect(
      pendingHostMessageFromState({ [HOST_MESSAGE_HANDOFF_STATE]: "   " })
    ).toBeNull();
  });
});

describe("host-message sessionStorage", () => {
  afterEach(() => {
    clearPendingHostMessage(ENGENTY_COPILOT_HOST_KEY);
  });

  it("round-trips exact Copilot host text and prefers router state", () => {
    writePendingHostMessage(
      ENGENTY_COPILOT_HOST_KEY,
      "  from storage\nexactly  "
    );
    expect(readPendingHostMessage(ENGENTY_COPILOT_HOST_KEY)).toBe(
      "  from storage\nexactly  "
    );
    expect(
      resolvePendingHostMessage(ENGENTY_COPILOT_HOST_KEY, {
        [HOST_MESSAGE_HANDOFF_STATE]: "  from state  ",
      })
    ).toBe("  from state  ");
    expect(resolvePendingHostMessage(ENGENTY_COPILOT_HOST_KEY, null)).toBe(
      "  from storage\nexactly  "
    );
    clearPendingHostMessage(ENGENTY_COPILOT_HOST_KEY);
    expect(readPendingHostMessage(ENGENTY_COPILOT_HOST_KEY)).toBeNull();
  });
});
