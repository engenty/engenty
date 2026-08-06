import { describe, expect, it } from "vitest";
import { isAgentThreadNotFoundError } from "./is-agent-thread-not-found-error.js";

describe("isAgentThreadNotFoundError", () => {
  it("detects apps/ai session GET 404", () => {
    expect(
      isAgentThreadNotFoundError(
        new Error('ai session get HTTP 404: {"error":"not_found"}')
      )
    ).toBe(true);
  });

  it("ignores other HTTP errors", () => {
    expect(
      isAgentThreadNotFoundError(new Error("ai session get HTTP 500: boom"))
    ).toBe(false);
  });
});
