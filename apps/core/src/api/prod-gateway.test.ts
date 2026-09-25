import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it } from "vitest";
import {
  createProdGatewayHooks,
  type ProdGatewayConfig,
} from "./prod-gateway.js";

function gatewayConfig(
  overrides: Partial<ProdGatewayConfig>
): ProdGatewayConfig {
  return {
    aiUrl: "http://127.0.0.1:8790",
    docsEnabled: false,
    docsUrl: "http://127.0.0.1:3000",
    manageEnabled: false,
    manageRoot: "/nonexistent-manage",
    studioBasicAuth: null,
    studioEnabled: false,
    studioUrl: "http://127.0.0.1:43111",
    uiRoot: "/nonexistent-ui",
    ...overrides,
  };
}

function requestStudio(
  config: ProdGatewayConfig,
  headers: Record<string, string> = {}
): number {
  let status = 0;
  const req = {
    method: "GET",
    url: "/studio",
    headers,
    socket: { destroyed: false, destroy: () => undefined },
  } as unknown as IncomingMessage;
  const res = {
    headersSent: false,
    writeHead: (code: number) => {
      status = code;
    },
    end: () => undefined,
  } as unknown as ServerResponse;
  createProdGatewayHooks(config).maybeHandleRequest(req, res, () => {
    throw new Error("hono should not run");
  });
  return status;
}

describe("prod-gateway hooks", () => {
  it("returns 404 for /studio when studio disabled", () => {
    expect(requestStudio(gatewayConfig({ studioEnabled: false }))).toBe(404);
  });

  it("requires the configured basic auth before proxying to studio", () => {
    const config = gatewayConfig({
      studioBasicAuth: { user: "operator", password: "secret" },
      studioEnabled: true,
    });
    const wrong = Buffer.from("operator:wrong").toString("base64");

    expect(requestStudio(config)).toBe(401);
    expect(requestStudio(config, { authorization: `Basic ${wrong}` })).toBe(
      401
    );
  });
});
