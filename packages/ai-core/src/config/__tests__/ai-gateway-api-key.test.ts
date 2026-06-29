import { afterEach, describe, expect, it } from "vitest";
import { readAiGatewayApiKeyFromEnv } from "../ai-gateway-api-key.js";

describe("readAiGatewayApiKeyFromEnv", () => {
  const orig = process.env.AI_GATEWAY_API_KEY;

  afterEach(() => {
    if (orig === undefined) {
      Reflect.deleteProperty(process.env, "AI_GATEWAY_API_KEY");
    } else {
      process.env.AI_GATEWAY_API_KEY = orig;
    }
  });

  it("returns null when unset or empty", () => {
    Reflect.deleteProperty(process.env, "AI_GATEWAY_API_KEY");
    expect(readAiGatewayApiKeyFromEnv()).toBeNull();
    process.env.AI_GATEWAY_API_KEY = "   ";
    expect(readAiGatewayApiKeyFromEnv()).toBeNull();
  });

  it("returns trimmed key from env", () => {
    process.env.AI_GATEWAY_API_KEY = "  gateway-key  ";
    expect(readAiGatewayApiKeyFromEnv()).toBe("gateway-key");
  });
});
