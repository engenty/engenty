/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it } from "vitest";
import {
  clearPendingCopilotUrlThread,
  PENDING_COPILOT_URL_THREAD_STORAGE_KEY,
  readPendingCopilotUrlThreadId,
  writePendingCopilotUrlThreadId,
} from "./copilot-pending-url-thread.js";

const SESSION_A = "11111111-1111-4111-8111-111111111111";

describe("copilot-pending-url-thread", () => {
  afterEach(() => {
    window.sessionStorage.clear();
  });

  it("round-trips pending url thread ids in sessionStorage", () => {
    writePendingCopilotUrlThreadId(SESSION_A);
    expect(readPendingCopilotUrlThreadId()).toBe(SESSION_A);
    expect(
      window.sessionStorage.getItem(PENDING_COPILOT_URL_THREAD_STORAGE_KEY)
    ).toBe(SESSION_A);
    clearPendingCopilotUrlThread();
    expect(readPendingCopilotUrlThreadId()).toBeNull();
  });
});
