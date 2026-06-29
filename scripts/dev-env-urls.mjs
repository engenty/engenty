/**
 * Shared dev URL block for repo-root `.env.local`.
 * Default: localhost + Vite origin (`pnpm env:localhost:sync`).
 * Portless: HTTPS gateway URLs (`pnpm portless:env:sync`).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ports } from "../apps/ports.config.mjs";

export const DEV_URL_MARKER_START =
  "# --- engenty dev URLs (pnpm env:localhost:sync or pnpm portless:env:sync) ---";
export const DEV_URL_MARKER_END = "# --- end engenty dev URLs ---";

/** @deprecated Recognized when reading existing `.env.local` files. */
export const LEGACY_DEV_URL_MARKER_START =
  "# --- engenty dev URLs (portless.json; pnpm portless:env:sync) ---";

const MARKER_STARTS = [DEV_URL_MARKER_START, LEGACY_DEV_URL_MARKER_START];

export function portlessOrigin(name) {
  return `https://${name}.localhost`;
}

export function loadPortlessNames(portlessConfigPath) {
  const raw = fs.readFileSync(portlessConfigPath, "utf8");
  const parsed = JSON.parse(raw);
  const apps = parsed.apps ?? {};
  return {
    coreName: apps["apps/core"]?.name ?? "engenty",
    aiName: apps["apps/ai"]?.name ?? "ai.engenty",
    docsName: apps["apps/docs"]?.name ?? "docs.engenty",
  };
}

export function buildLocalhostEntries() {
  const uiOrigin = `http://localhost:${ports.ui}`;
  const coreOrigin = `http://127.0.0.1:${ports.core}`;
  const aiOrigin = `http://127.0.0.1:${ports.ai}`;
  const docsOrigin = `http://127.0.0.1:${ports.docs}`;
  const corsOrigins = [
    uiOrigin,
    `http://127.0.0.1:${ports.ui}`,
    coreOrigin,
    aiOrigin,
    `http://localhost:${ports.docs}`,
    "http://127.0.0.1:43111",
  ].join(",");
  return {
    ENGENTY_UI_BASE_URL: uiOrigin,
    ENGENTY_API_BASE_URL: coreOrigin,
    ENGENTY_AI_BASE_URL: aiOrigin,
    ENGENTY_DOCS_BASE_URL: docsOrigin,
    ENGENTY_CORE_BASE_URL: coreOrigin,
    ENGENTY_CORS_ORIGINS: corsOrigins,
    VITE_ENGENTY_AI_BASE_URL: uiOrigin,
    NEXT_PUBLIC_DOCS_SITE_URL: uiOrigin,
  };
}

export function buildLocalhostAppUrlComments() {
  const ui = `http://localhost:${ports.ui}`;
  return [
    "# App URLs (open after pnpm dev)",
    `#   Main app:  ${ui}/`,
    `#   AI:        ${ui}/ai`,
    `#   Docs:      ${ui}/docs`,
    `#   Studio:    ${ui}/studio`,
    `#   OpenAPI:   ${ui}/api/docs`,
  ];
}

export function buildPortlessEntries({ coreName, aiName }) {
  const gateway = portlessOrigin(coreName);
  const ai = portlessOrigin(aiName);
  const corsOrigins = [
    gateway,
    ai,
    `http://localhost:${ports.docs}`,
    "http://127.0.0.1:43111",
  ].join(",");
  return {
    ENGENTY_UI_BASE_URL: gateway,
    ENGENTY_API_BASE_URL: gateway,
    ENGENTY_AI_BASE_URL: ai,
    ENGENTY_DOCS_BASE_URL: gateway,
    ENGENTY_CORE_BASE_URL: gateway,
    ENGENTY_CORS_ORIGINS: corsOrigins,
    VITE_ENGENTY_AI_BASE_URL: gateway,
    NEXT_PUBLIC_DOCS_SITE_URL: gateway,
  };
}

export function buildPortlessAppUrlComments({ coreName, aiName, docsName }) {
  const gateway = portlessOrigin(coreName);
  const aiDirect = portlessOrigin(aiName);
  const docsDirect = portlessOrigin(docsName);
  return [
    "# App URLs (open after pnpm portless && pnpm dev)",
    `#   Main app:  ${gateway}/`,
    `#   AI:        ${gateway}/ai`,
    `#   Docs:      ${gateway}/docs`,
    `#   Studio:    ${gateway}/studio`,
    `#   OpenAPI:   ${gateway}/api/docs`,
    "# Direct upstream (debug):",
    `#   AI:        ${aiDirect}/`,
    `#   Docs:      ${docsDirect}/`,
  ];
}

export function renderDevUrlBlock(
  entries,
  { headerComments = [], markerStart = DEV_URL_MARKER_START } = {}
) {
  const lines = [markerStart, ...headerComments];
  for (const [key, value] of Object.entries(entries)) {
    lines.push(`${key}=${value}`);
  }
  lines.push(DEV_URL_MARKER_END);
  return `${lines.join("\n")}\n`;
}

const MARKER_END = DEV_URL_MARKER_END;

/** Any historical start line for the managed dev URL block. */
function findDevUrlBlockStart(content) {
  for (const markerStart of MARKER_STARTS) {
    const index = content.indexOf(markerStart);
    if (index !== -1) {
      return index;
    }
  }
  const generic = content.indexOf("# --- engenty dev URLs");
  return generic === -1 ? -1 : generic;
}

export function stripDevUrlBlock(content) {
  let stripped = content;
  for (;;) {
    const start = findDevUrlBlockStart(stripped);
    if (start === -1) {
      return stripped;
    }
    const end = stripped.indexOf(MARKER_END, start);
    if (end === -1) {
      return stripped;
    }
    const after = end + MARKER_END.length;
    let rest = stripped.slice(after);
    if (rest.startsWith("\r\n")) {
      rest = rest.slice(2);
    } else if (rest.startsWith("\n")) {
      rest = rest.slice(1);
    }
    const before = stripped.slice(0, start).replace(/\n?$/, "\n");
    stripped = before + rest;
  }
}

export function upsertDevUrlBlock(content, block) {
  const stripped = stripDevUrlBlock(content);
  const trimmed = stripped.trimEnd();
  if (trimmed.length === 0) {
    return block;
  }
  return `${trimmed}\n\n${block}`;
}

export function resolveWorkspaceRoot(fromDir = path.dirname(fileURLToPath(import.meta.url))) {
  return path.resolve(fromDir, "..");
}

export function writeDevUrlBlock(
  envLocalPath,
  entries,
  { headerComments = [], markerStart = DEV_URL_MARKER_START } = {}
) {
  const block = renderDevUrlBlock(entries, { headerComments, markerStart });
  const existing = fs.existsSync(envLocalPath)
    ? fs.readFileSync(envLocalPath, "utf8")
    : "";
  fs.writeFileSync(envLocalPath, upsertDevUrlBlock(existing, block), "utf8");
  return entries;
}
