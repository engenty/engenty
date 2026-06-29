import { describe, expect, it } from "vitest";
import { isAgentSessionNotFoundError } from "./is-agent-session-not-found-error.js";

describe("isAgentSessionNotFoundError", () => {
  it("detects apps/ai session GET 404", () => {
    expect(
      isAgentSessionNotFoundError(
        new Error('ai session get HTTP 404: {"error":"not_found"}')
      )
    ).toBe(true);
  });

  it("ignores other HTTP errors", () => {
    expect(
      isAgentSessionNotFoundError(new Error("ai session get HTTP 500: boom"))
    ).toBe(false);
  });
});
