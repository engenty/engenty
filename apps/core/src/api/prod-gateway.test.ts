import { describe, expect, it, vi } from "vitest";
import { shouldRegisterDevGateway } from "./dev-gateway.js";
import {
  readProdGatewayConfig,
  shouldRegisterProdGateway,
} from "./prod-gateway.js";

describe("prod-gateway", () => {
  it("shouldRegisterProdGateway is false when dev gateway would register", () => {
    const prevDev = process.env.ENGENTY_DEV_GATEWAY;
    const prevEnv = process.env.ENV;
    const prevProd = process.env.ENGENTY_PROD_GATEWAY;
    process.env.ENGENTY_DEV_GATEWAY = "1";
    process.env.ENV = "development";
    process.env.ENGENTY_PROD_GATEWAY = "1";
    try {
      expect(shouldRegisterDevGateway()).toBe(true);
      expect(shouldRegisterProdGateway()).toBe(false);
    } finally {
      if (prevDev === undefined) {
        delete process.env.ENGENTY_DEV_GATEWAY;
      } else {
        process.env.ENGENTY_DEV_GATEWAY = prevDev;
      }
      if (prevEnv === undefined) {
        delete process.env.ENV;
      } else {
        process.env.ENV = prevEnv;
      }
      if (prevProd === undefined) {
        delete process.env.ENGENTY_PROD_GATEWAY;
      } else {
        process.env.ENGENTY_PROD_GATEWAY = prevProd;
      }
    }
  });

  it("shouldRegisterProdGateway is true when ENGENTY_PROD_GATEWAY=1 and not dev gateway", () => {
    const prevDev = process.env.ENGENTY_DEV_GATEWAY;
    const prevEnv = process.env.ENV;
    const prevProd = process.env.ENGENTY_PROD_GATEWAY;
    delete process.env.ENGENTY_DEV_GATEWAY;
    delete process.env.ENV;
    process.env.ENGENTY_PROD_GATEWAY = "1";
    try {
      expect(shouldRegisterProdGateway()).toBe(true);
    } finally {
      if (prevDev === undefined) {
        delete process.env.ENGENTY_DEV_GATEWAY;
      } else {
        process.env.ENGENTY_DEV_GATEWAY = prevDev;
      }
      if (prevEnv === undefined) {
        delete process.env.ENV;
      } else {
        process.env.ENV = prevEnv;
      }
      if (prevProd === undefined) {
        delete process.env.ENGENTY_PROD_GATEWAY;
      } else {
        process.env.ENGENTY_PROD_GATEWAY = prevProd;
      }
    }
  });

  it("readProdGatewayConfig parses studio basic auth", () => {
    const prev = process.env.ENGENTY_GATEWAY_STUDIO_BASIC_AUTH;
    process.env.ENGENTY_GATEWAY_STUDIO_BASIC_AUTH = "operator:secret";
    try {
      const config = readProdGatewayConfig();
      expect(config.studioBasicAuth).toEqual({
        user: "operator",
        password: "secret",
      });
    } finally {
      if (prev === undefined) {
        delete process.env.ENGENTY_GATEWAY_STUDIO_BASIC_AUTH;
      } else {
        process.env.ENGENTY_GATEWAY_STUDIO_BASIC_AUTH = prev;
      }
    }
  });
});

describe("prod-gateway hooks", () => {
  it("returns 404 for /studio when studio disabled", async () => {
    const { createProdGatewayHooks } = await import("./prod-gateway.js");
    const hooks = createProdGatewayHooks({
      aiUrl: "http://127.0.0.1:8790",
      docsEnabled: false,
      docsUrl: "http://127.0.0.1:3000",
      manageEnabled: true,
      manageRoot: "/nonexistent-manage",
      studioBasicAuth: null,
      studioEnabled: false,
      studioUrl: "http://127.0.0.1:43111",
      uiRoot: "/nonexistent-ui",
    });

    await new Promise<void>((resolve) => {
      const req = {
        method: "GET",
        url: "/studio",
        headers: {},
        socket: { destroyed: false, destroy: vi.fn() },
      } as unknown as import("node:http").IncomingMessage;

      const res = {
        headersSent: false,
        writeHead: vi.fn((_code: number) => {
          expect(_code).toBe(404);
        }),
        end: vi.fn((body?: string) => {
          expect(body).toContain("Studio");
          resolve();
        }),
      } as unknown as import("node:http").ServerResponse;

      hooks.maybeHandleRequest(req, res, () => {
        throw new Error("hono should not run");
      });
    });
  });
});
