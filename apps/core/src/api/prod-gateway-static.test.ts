import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { tryServeStatic } from "./prod-gateway-static.js";

const IMMUTABLE = "public, max-age=31536000, immutable";

function withRoot(
  files: Record<string, string>,
  run: (root: string) => void
): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "engenty-ui-"));
  try {
    for (const [rel, contents] of Object.entries(files)) {
      const full = path.join(root, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, contents);
    }
    run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function serve(
  root: string,
  url: string,
  runtimeEnv: Record<string, string> = {}
): { status: number; headers: Record<string, string>; body: string } {
  let status = 0;
  const headers: Record<string, string> = {};
  let body = "";
  const req = { method: "GET", url, headers: {} } as IncomingMessage;
  const res = {
    writeHead: (code: number, head?: Record<string, string | number>) => {
      status = code;
      for (const [key, value] of Object.entries(head ?? {})) {
        headers[key.toLowerCase()] = String(value);
      }
    },
    end: (chunk?: string | Buffer) => {
      body = chunk === undefined ? "" : chunk.toString();
    },
  } as unknown as ServerResponse;
  tryServeStatic(req, res, { rootDir: root, runtimeEnv, urlPrefix: "/" });
  return { status, headers, body };
}

describe("prod-gateway-static", () => {
  it("writes runtime settings into HTML but never into assets", () => {
    withRoot(
      {
        "index.html": "<!doctype html><html><head></head><body></body></html>",
        "app.js": "console.log('bundle');",
      },
      (root) => {
        const runtimeEnv = { VITE_SUPABASE_URL: "https://example.supabase.co" };
        expect(serve(root, "/", runtimeEnv).body).toContain(
          "https://example.supabase.co"
        );
        expect(serve(root, "/app.js", runtimeEnv).body).toBe(
          "console.log('bundle');"
        );
      }
    );
  });

  it("sends no-cache for HTML and immutable cache for Vite hashed /assets/*", () => {
    withRoot(
      {
        "index.html": "<html>ui</html>",
        "assets/index-Dkz6rOqp.js": "export {};",
        "assets/index-B2xK9mPq.css": ".a{}",
        "assets/logo-C3dEfGh1.svg": "<svg/>",
        "assets/chunk.deadbeef.js": "export {};",
        "assets/plain.js": "console.log(1);",
        "app.js": "export {};",
      },
      (root) => {
        const html = serve(root, "/mdl/contacts");
        expect(html.status).toBe(200);
        expect(html.headers["cache-control"]).toBe("no-cache");
        expect(html.headers["content-type"]).toContain("text/html");

        for (const url of [
          "/assets/index-Dkz6rOqp.js",
          "/assets/index-B2xK9mPq.css",
          "/assets/logo-C3dEfGh1.svg",
          "/assets/chunk.deadbeef.js",
        ]) {
          const res = serve(root, url);
          expect(res.status).toBe(200);
          expect(res.headers["cache-control"]).toBe(IMMUTABLE);
        }

        expect(serve(root, "/assets/plain.js").headers["cache-control"]).toBe(
          "no-cache"
        );
        expect(serve(root, "/app.js").headers["cache-control"]).toBe(
          "no-cache"
        );
      }
    );
  });
});
