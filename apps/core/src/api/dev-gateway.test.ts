import { describe, expect, it } from "vitest";
import { shouldRegisterDevGateway } from "./dev-gateway.js";

describe("dev-gateway", () => {
  it("shouldRegisterDevGateway is false without ENGENTY_DEV_GATEWAY", () => {
    const previous = process.env.ENGENTY_DEV_GATEWAY;
    delete process.env.ENGENTY_DEV_GATEWAY;
    try {
      expect(shouldRegisterDevGateway()).toBe(false);
    } finally {
      if (previous === undefined) {
        delete process.env.ENGENTY_DEV_GATEWAY;
      } else {
        process.env.ENGENTY_DEV_GATEWAY = previous;
      }
    }
  });
});
