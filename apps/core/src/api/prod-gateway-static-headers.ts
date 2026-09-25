import type { IncomingMessage } from "node:http";
import path from "node:path";
import {
  brotliCompressSync,
  gzipSync,
  constants as zlibConstants,
} from "node:zlib";

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

const COMPRESSIBLE_TYPES = new Set([
  "application/javascript",
  "application/json",
  "image/svg+xml",
]);

export function contentTypeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME[ext] ?? "application/octet-stream";
}

/**
 * Vite writes `[name]-[hash][extname]` under `/assets/` with an 8+ character
 * hash that is not hex-only (`index-Dkz6rOqp.js`). Webpack-style
 * `[name].[hexhash][extname]` still matches.
 */
function isHashedAssetName(base: string): boolean {
  if (/-[A-Za-z0-9_-]{8,}(?:\.[a-z0-9]+)+$/.test(base)) {
    return true;
  }
  return /\.[a-f0-9]{8,}(?:\.[a-z0-9]+)+$/i.test(base);
}

export function cacheControlFor(filePath: string): string {
  if (path.extname(filePath).toLowerCase() === ".html") {
    return "no-cache";
  }
  const inAssets = filePath.split(path.sep).includes("assets");
  if (inAssets && isHashedAssetName(path.basename(filePath))) {
    return "public, max-age=31536000, immutable";
  }
  return "no-cache";
}

function acceptEncodingHeader(
  headers: IncomingMessage["headers"] | undefined
): string | undefined {
  const value = headers?.["accept-encoding"];
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  return value;
}

function encodingQuality(token: string): { name: string; q: number } | null {
  const [namePart, ...params] = token.split(";");
  const name = namePart?.trim().toLowerCase();
  if (!name) {
    return null;
  }
  let q = 1;
  for (const param of params) {
    const match = param.trim().match(/^q=([\d.]+)$/i);
    if (match) {
      q = Number.parseFloat(match[1] ?? "0");
    }
  }
  if (!(q > 0 && Number.isFinite(q))) {
    return null;
  }
  return { name, q };
}

function negotiateContentEncoding(
  acceptEncoding: string | undefined
): "br" | "gzip" | null {
  if (!acceptEncoding) {
    return null;
  }
  let brQ = -1;
  let gzipQ = -1;
  let starQ = -1;
  for (const token of acceptEncoding.split(",")) {
    const parsed = encodingQuality(token);
    if (!parsed) {
      continue;
    }
    if (parsed.name === "br") {
      brQ = Math.max(brQ, parsed.q);
    } else if (parsed.name === "gzip") {
      gzipQ = Math.max(gzipQ, parsed.q);
    } else if (parsed.name === "*") {
      starQ = Math.max(starQ, parsed.q);
    }
  }
  if (brQ < 0 && starQ > 0) {
    brQ = starQ;
  }
  if (gzipQ < 0 && starQ > 0) {
    gzipQ = starQ;
  }
  if (brQ < 0 && gzipQ < 0) {
    return null;
  }
  return brQ >= gzipQ ? "br" : "gzip";
}

function isCompressible(contentType: string): boolean {
  const type = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  return type.startsWith("text/") || COMPRESSIBLE_TYPES.has(type);
}

function compressBody(body: Buffer, encoding: "br" | "gzip"): Buffer {
  if (encoding === "br") {
    return brotliCompressSync(body, {
      params: {
        [zlibConstants.BROTLI_PARAM_QUALITY]: 5,
        [zlibConstants.BROTLI_PARAM_SIZE_HINT]: body.length,
      },
    });
  }
  return gzipSync(body);
}

export function encodeStaticBody(
  body: Buffer,
  contentType: string,
  headers: IncomingMessage["headers"] | undefined
): { body: Buffer; contentEncoding?: "br" | "gzip"; vary?: string } {
  if (!isCompressible(contentType)) {
    return { body };
  }
  const encoding = negotiateContentEncoding(acceptEncodingHeader(headers));
  if (!encoding) {
    return { body, vary: "Accept-Encoding" };
  }
  const compressed = compressBody(body, encoding);
  if (compressed.length >= body.length) {
    return { body, vary: "Accept-Encoding" };
  }
  return {
    body: compressed,
    contentEncoding: encoding,
    vary: "Accept-Encoding",
  };
}
