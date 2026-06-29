import type { OpenAPIHono } from "@hono/zod-openapi";
import { jsonApiSuccess } from "./api-response.js";
import { requireSuperAdmin } from "./authz.js";

const SECRET_PATTERNS = [
  /key$/i,
  /secret$/i,
  /token$/i,
  /password$/i,
  /auth$/i,
  /credential/i,
  /private/i,
];

function isLikelySecret(key: string): boolean {
  const upper = key.toUpperCase();
  return SECRET_PATTERNS.some((re) => re.test(key));
}

function maskValue(value: string): string {
  if (!value || value.length < 8) {
    return value ? "••••••••" : "";
  }
  return `${value.slice(0, 4)}${"•".repeat(Math.min(value.length - 6, 12))}${value.slice(-2)}`;
}

/** Shown in Manage env diagnostics when unset or empty (same loading rules as other keys). */
const DOCUMENTED_OPTIONAL_ENV_KEYS = [
  "FIRECRAWL_API_KEY",
  "FIRECRAWL_API_URL",
] as const;

export function registerSettingsRoutes(params: {
  app: OpenAPIHono;
  config: Record<string, unknown>;
}) {
  const { app, config } = params;

  app.get("/api/settings/env", async (c) => {
    const authResult = await requireSuperAdmin(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }

    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value == null) {
        continue;
      }
      const str = String(value);
      if (str.trim() === "") {
        continue;
      }
      env[key] = isLikelySecret(key) ? maskValue(str) : str;
    }

    const sorted = Object.keys(env)
      .filter((k) => !(k.startsWith("npm_") || k.startsWith("PNPM_")))
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

    const vars = sorted.map((key) => ({
      key,
      value: env[key],
      masked: isLikelySecret(key),
    }));

    const present = new Set(sorted);
    const extras = DOCUMENTED_OPTIONAL_ENV_KEYS.filter(
      (k) => !present.has(k)
    ).map((key) => ({
      key,
      value: "",
      masked: false,
      missing: true,
    }));

    const merged = [...vars, ...extras].sort((a, b) =>
      a.key.localeCompare(b.key, undefined, { sensitivity: "base" })
    );

    return jsonApiSuccess(c, { vars: merged });
  });
}
