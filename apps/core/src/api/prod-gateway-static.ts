import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";

const MIME: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json",
  ".mjs": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function resolveSafeFile(root: string, relativePath: string): string | null {
  const normalized = path
    .normalize(relativePath)
    .replace(/^(\.\.(\/|\\|$))+/, "");
  const candidate = path.join(root, normalized);
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  if (
    resolvedCandidate !== resolvedRoot &&
    !resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`)
  ) {
    return null;
  }
  return resolvedCandidate;
}

function contentTypeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME[ext] ?? "application/octet-stream";
}

function cacheControlFor(filePath: string): string {
  const base = path.basename(filePath);
  if (base.includes("-") && /\.[a-f0-9]{8,}\./i.test(base)) {
    return "public, max-age=31536000, immutable";
  }
  return "no-cache";
}

export interface ServeStaticOptions {
  rootDir: string;
  spaIndex?: string;
  /** URL prefix stripped before mapping to disk (e.g. `/manage`). */
  urlPrefix: string;
}

export function tryServeStatic(
  req: IncomingMessage,
  res: ServerResponse,
  options: ServeStaticOptions
): boolean {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
    res.end("Method Not Allowed");
    return true;
  }

  const root = options.rootDir.trim();
  if (!(root && fs.existsSync(root))) {
    res.writeHead(503, { "content-type": "text/plain; charset=utf-8" });
    res.end("Static root not configured");
    return true;
  }

  const pathname = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
  const prefix =
    options.urlPrefix === "/" ? "" : options.urlPrefix.replace(/\/$/, "");
  let relative = pathname;
  if (prefix && (pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    relative = pathname.slice(prefix.length) || "/";
  }

  const segments = relative.split("/").filter(Boolean);
  let filePath = resolveSafeFile(root, segments.join("/"));

  if (
    filePath &&
    fs.existsSync(filePath) &&
    fs.statSync(filePath).isDirectory()
  ) {
    filePath = resolveSafeFile(
      root,
      path.join(segments.join("/"), "index.html")
    );
  }

  const spaIndex = options.spaIndex ?? "index.html";
  const hasExtension = Boolean(path.extname(relative));
  if (
    !((filePath && fs.existsSync(filePath)) || hasExtension) &&
    relative !== "/favicon.ico"
  ) {
    filePath = resolveSafeFile(root, spaIndex);
  }

  if (
    !(filePath && fs.existsSync(filePath) && fs.statSync(filePath).isFile())
  ) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not Found");
    return true;
  }

  const body = fs.readFileSync(filePath);
  res.writeHead(200, {
    "cache-control": cacheControlFor(filePath),
    "content-type": contentTypeFor(filePath),
    "content-length": String(body.length),
  });
  if (req.method === "HEAD") {
    res.end();
    return true;
  }
  res.end(body);
  return true;
}
