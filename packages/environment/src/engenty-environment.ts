/**
 * Workspace `ENV` tier from `.env` / process (Node) or Vite `import.meta.env` (browser).
 * Use {@link isEngentyDevelopmentEnvironment} for gating developer-only UI and APIs.
 */
// `types` resolves via this package's tsconfig only when WE compile; consumers
// type-check this source directly (types -> src), so the reference must travel
// with the file.
/// <reference types="vite/client" />

function readImportMetaEnv(): string | undefined {
  try {
    // Direct `import.meta.env.ENV` so Vite can replace it at build time.
    const raw = import.meta.env?.ENV;
    if (typeof raw !== "string") {
      return;
    }
    const t = raw.trim();
    return t.length > 0 ? t : undefined;
  } catch {
    return;
  }
}

function readProcessEnv(): string | undefined {
  if (typeof process === "undefined" || !process.env) {
    return;
  }
  const raw = process.env.ENV;
  if (typeof raw !== "string") {
    return;
  }
  const t = raw.trim();
  return t.length > 0 ? t : undefined;
}

/** Trimmed `ENV` when set (workspace / deployment tier), otherwise `undefined`. */
export function engentyEnv(): string | undefined {
  const fromMeta = readImportMetaEnv();
  if (fromMeta !== undefined) {
    return fromMeta;
  }
  return readProcessEnv();
}

/** True when `ENV` is set to `development` (case-insensitive). */
export function isEngentyDevelopmentEnvironment(): boolean {
  const v = engentyEnv()?.toLowerCase();
  return v === "development";
}
