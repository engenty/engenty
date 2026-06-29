export interface EngentyDevServiceUrls {
  ai: string;
  api: string;
  corsOrigins: string[];
  docs: string;
  ui: string;
}

function requireEnvUrl(key: string): string {
  const raw =
    typeof process !== "undefined" && process.env
      ? process.env[key]
      : undefined;
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) {
    throw new Error(
      `Missing ${key}. Run pnpm dev:urls:portless (see docs/dev/portless-local-urls.md).`
    );
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("invalid protocol");
    }
    return value.replace(/\/$/, "");
  } catch {
    throw new Error(
      `Invalid ${key}="${value}". Run pnpm dev:urls:portless (see docs/dev/portless-local-urls.md).`
    );
  }
}

function parseCorsOrigins(raw: string): string[] {
  const origins = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (origins.length === 0) {
    throw new Error(
      "ENGENTY_CORS_ORIGINS must list at least one origin. Run pnpm dev:urls:portless."
    );
  }
  for (const origin of origins) {
    try {
      const url = new URL(origin);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("invalid protocol");
      }
    } catch {
      throw new Error(`Invalid CORS origin in ENGENTY_CORS_ORIGINS: ${origin}`);
    }
  }
  return origins;
}

/** Required dev service URLs from process.env (no hardcoded host fallbacks). */
export function resolveEngentyDevServiceUrls(): EngentyDevServiceUrls {
  return {
    ui: requireEnvUrl("ENGENTY_UI_BASE_URL"),
    api: requireEnvUrl("ENGENTY_API_BASE_URL"),
    ai: requireEnvUrl("ENGENTY_AI_BASE_URL"),
    docs: requireEnvUrl("ENGENTY_DOCS_BASE_URL"),
    corsOrigins: readCorsOriginsFromEnv(),
  };
}

function readCorsOriginsFromEnv(): string[] {
  const raw =
    typeof process !== "undefined" && process.env
      ? process.env.ENGENTY_CORS_ORIGINS
      : undefined;
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) {
    throw new Error(
      "Missing ENGENTY_CORS_ORIGINS. Run pnpm dev:urls:portless (see docs/dev/portless-local-urls.md)."
    );
  }
  return parseCorsOrigins(value);
}

/** Returns true when `origin` matches an allowed ENGENTY_CORS_ORIGINS entry. */
export function isEngentyCorsOriginAllowed(origin: string): boolean {
  try {
    return readCorsOriginsFromEnv().includes(origin);
  } catch {
    return false;
  }
}
