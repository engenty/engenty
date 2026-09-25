import fs from "node:fs";
import type {
  IncomingMessage,
  OutgoingHttpHeaders,
  ServerResponse,
} from "node:http";
import path from "node:path";
import {
  injectRuntimeEnv,
  resolveUiRuntimeEnv,
} from "./prod-gateway-runtime-env.js";
import {
  cacheControlFor,
  contentTypeFor,
  encodeStaticBody,
} from "./prod-gateway-static-headers.js";

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

export interface ServeStaticOptions {
  rootDir: string;
  /**
   * Client-visible settings spliced into every served HTML document, so a
   * prebuilt image can serve an install it was not built for. Defaults to the
   * process environment; pass `{}` to serve the bundle exactly as built.
   */
  runtimeEnv?: Record<string, string>;
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

  const contentType = contentTypeFor(filePath);
  const rawBody = contentType.startsWith("text/html")
    ? Buffer.from(
        injectRuntimeEnv(
          fs.readFileSync(filePath, "utf-8"),
          options.runtimeEnv ?? resolveUiRuntimeEnv()
        ),
        "utf-8"
      )
    : fs.readFileSync(filePath);
  const encoded = encodeStaticBody(rawBody, contentType, req.headers);
  const headers: OutgoingHttpHeaders = {
    "cache-control": cacheControlFor(filePath),
    "content-type": contentType,
    "content-length": encoded.body.length,
  };
  if (encoded.vary) {
    headers.vary = encoded.vary;
  }
  if (encoded.contentEncoding) {
    headers["content-encoding"] = encoded.contentEncoding;
  }
  res.writeHead(200, headers);
  if (req.method === "HEAD") {
    res.end();
    return true;
  }
  res.end(encoded.body);
  return true;
}
