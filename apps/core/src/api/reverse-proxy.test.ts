import http from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { createReverseProxy } from "./reverse-proxy.js";

describe("reverse-proxy", () => {
  it("forwards HTTP requests and applies proxyReq/proxyRes hooks", async () => {
    const upstream = http.createServer((req, res) => {
      if (req.url === "/redirect") {
        res.writeHead(302, {
          location: "https://docs.engenty.localhost/path",
        });
        res.end();
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          host: req.headers.host,
          forwardedHost: req.headers["x-forwarded-host"],
          forwardedProto: req.headers["x-forwarded-proto"],
        })
      );
    });

    await new Promise<void>((resolve) => upstream.listen(0, resolve));
    const { port } = upstream.address() as AddressInfo;

    const proxy = createReverseProxy({
      target: `http://127.0.0.1:${port}`,
      changeOrigin: false,
    });
    proxy.on("proxyReq", (proxyReq, req) => {
      const host = req.headers.host;
      if (host) {
        proxyReq.setHeader("x-forwarded-host", host);
      }
      proxyReq.setHeader("x-forwarded-proto", "https");
    });
    proxy.on("proxyRes", (proxyRes) => {
      const location = proxyRes.headers.location;
      if (
        typeof location === "string" &&
        location.includes("docs.engenty.localhost")
      ) {
        proxyRes.headers.location = location.replaceAll(
          "https://docs.engenty.localhost",
          "https://engenty.localhost"
        );
      }
    });

    const gateway = http.createServer((clientReq, clientRes) => {
      proxy.web(clientReq, clientRes);
    });
    await new Promise<void>((resolve) => gateway.listen(0, resolve));
    const gatewayPort = (gateway.address() as AddressInfo).port;

    const proxiedBody = await new Promise<{
      host: string;
      forwardedHost: string;
      forwardedProto: string;
    }>((resolve, reject) => {
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port: gatewayPort,
          path: "/api/ping",
          method: "GET",
          headers: { host: "engenty.localhost" },
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => {
            data += chunk.toString();
          });
          res.on("end", () => {
            resolve(
              JSON.parse(data) as {
                host: string;
                forwardedHost: string;
                forwardedProto: string;
              }
            );
          });
        }
      );
      req.on("error", reject);
      req.end();
    });
    expect(proxiedBody).toEqual({
      host: "engenty.localhost",
      forwardedHost: "engenty.localhost",
      forwardedProto: "https",
    });

    const redirectLocation = await new Promise<string>((resolve, reject) => {
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port: gatewayPort,
          path: "/redirect",
          method: "GET",
          headers: { host: "engenty.localhost" },
        },
        (res) => {
          resolve(String(res.headers.location ?? ""));
        }
      );
      req.on("error", reject);
      req.end();
    });
    expect(redirectLocation).toBe("https://engenty.localhost/path");

    await new Promise<void>((resolve) => gateway.close(() => resolve()));
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  });
});
