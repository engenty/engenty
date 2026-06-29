import { describe, expect, it } from "vitest";
import { isCopilotThreadNotFoundError } from "./copilot-thread-not-found.js";

describe("isCopilotThreadNotFoundError", () => {
  it("detects apps/ai thread HTTP 404 errors", () => {
    expect(
      isCopilotThreadNotFoundError(
        new Error('ai session get HTTP 404: {"error":"agent_threads.notFound"}')
      )
    ).toBe(true);
  });

  it("detects not_found codes in error text", () => {
    expect(
      isCopilotThreadNotFoundError(new Error("agent_threads.not_found"))
    ).toBe(true);
  });

  it("returns false for other failures", () => {
    expect(
      isCopilotThreadNotFoundError(new Error("ai session get HTTP 503"))
    ).toBe(false);
  });
});
