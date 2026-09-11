import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { tryServeStatic } from "./prod-gateway-static.js";

describe("prod-gateway-static", () => {
  it("serves index.html for SPA routes", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "engenty-ui-"));
    fs.writeFileSync(path.join(root, "index.html"), "<html>ui</html>");
    try {
      let status = 0;
      let body = "";
      const req = {
        method: "GET",
        url: "/mdl/contacts",
        headers: {},
      } as import("node:http").IncomingMessage;
      const res = {
        writeHead: (code: number) => {
          status = code;
        },
        end: (chunk?: string | Buffer) => {
          body =
            chunk === undefined
              ? ""
              : typeof chunk === "string"
                ? chunk
                : chunk.toString("utf8");
        },
      } as unknown as import("node:http").ServerResponse;

      const handled = tryServeStatic(req, res, {
        rootDir: root,
        urlPrefix: "/",
      });
      expect(handled).toBe(true);
      expect(status).toBe(200);
      expect(body).toContain("ui");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("serves manage under /manage prefix", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "engenty-manage-"));
    fs.writeFileSync(path.join(root, "index.html"), "<html>manage</html>");
    try {
      let status = 0;
      let body = "";
      const req = {
        method: "GET",
        url: "/manage/tenants",
        headers: {},
      } as import("node:http").IncomingMessage;
      const res = {
        writeHead: (code: number) => {
          status = code;
        },
        end: (chunk?: string | Buffer) => {
          body =
            chunk === undefined
              ? ""
              : typeof chunk === "string"
                ? chunk
                : chunk.toString("utf8");
        },
      } as unknown as import("node:http").ServerResponse;

      const handled = tryServeStatic(req, res, {
        rootDir: root,
        urlPrefix: "/manage",
      });
      expect(handled).toBe(true);
      expect(status).toBe(200);
      expect(body).toContain("manage");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("writes runtime settings into HTML but never into assets", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "engenty-ui-"));
    fs.writeFileSync(
      path.join(root, "index.html"),
      "<!doctype html><html><head></head><body></body></html>"
    );
    fs.writeFileSync(path.join(root, "app.js"), "console.log('bundle');");
    const runtimeEnv = { VITE_SUPABASE_URL: "https://example.supabase.co" };

    const serve = (url: string) => {
      let body = "";
      const req = {
        method: "GET",
        url,
        headers: {},
      } as import("node:http").IncomingMessage;
      const res = {
        writeHead: () => {
          // status is not under test here
        },
        end: (chunk?: string | Buffer) => {
          body =
            chunk === undefined
              ? ""
              : typeof chunk === "string"
                ? chunk
                : chunk.toString("utf8");
        },
      } as unknown as import("node:http").ServerResponse;
      tryServeStatic(req, res, { rootDir: root, runtimeEnv, urlPrefix: "/" });
      return body;
    };

    try {
      expect(serve("/")).toContain("https://example.supabase.co");
      expect(serve("/app.js")).toBe("console.log('bundle');");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
