import http from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { createReverseProxy } from "./reverse-proxy.js";

async function listen(server: http.Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  return (server.address() as AddressInfo).port;
}

describe("reverse-proxy", () => {
  it("keeps the client Host and lets proxyRes hooks rewrite response headers", async () => {
    const upstream = http.createServer((req, res) => {
      res.writeHead(302, { location: "https://upstream.internal/path" });
      res.end(req.headers.host);
    });
    const proxy = createReverseProxy({
      target: `http://127.0.0.1:${await listen(upstream)}`,
      changeOrigin: false,
    });
    proxy.on("proxyRes", (proxyRes) => {
      proxyRes.headers.location = "https://engenty.localhost/path";
    });
    const gateway = http.createServer((req, res) => proxy.web(req, res));
    const gatewayPort = await listen(gateway);

    try {
      const { location, upstreamHost } = await new Promise<{
        location: string | undefined;
        upstreamHost: string;
      }>((resolve, reject) => {
        const req = http.request(
          {
            hostname: "127.0.0.1",
            port: gatewayPort,
            path: "/redirect",
            headers: { host: "engenty.localhost" },
          },
          (res) => {
            let data = "";
            res.on("data", (chunk) => {
              data += chunk.toString();
            });
            res.on("end", () =>
              resolve({ location: res.headers.location, upstreamHost: data })
            );
          }
        );
        req.on("error", reject);
        req.end();
      });

      expect(upstreamHost).toBe("engenty.localhost");
      expect(location).toBe("https://engenty.localhost/path");
    } finally {
      await new Promise<void>((resolve) => gateway.close(() => resolve()));
      await new Promise<void>((resolve) => upstream.close(() => resolve()));
    }
  });
});
