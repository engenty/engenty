import { UnconfiguredModelGatewayError } from "@engenty/ai-core";
import { describe, expect, it } from "vitest";
import { handleRouteError } from "../http.js";

describe("handleRouteError", () => {
  it("tells the client when the selected model gateway is not configured", () => {
    let body: unknown;
    let status: number | undefined;
    const c = {
      json(object: unknown, code?: number) {
        body = object;
        status = code;
        return new Response();
      },
    };

    handleRouteError(
      c,
      "run memory mode preflight failed",
      "agent_threads.runFailed",
      new UnconfiguredModelGatewayError("openrouter", "OPENROUTER_API_KEY")
    );

    expect(status).toBe(503);
    expect(body).toEqual({
      error: "agent_threads.modelGatewayUnconfigured",
    });
  });
});
