import {
  createPlatformSettingsRepoSupabase,
  createSettingsResolver,
  type PlatformSettingInput,
  type SettingsResolver,
} from "@engenty/platform-settings";
import { createLogger } from "@engenty/telemetry";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { getEnvManifest } from "../../cli/env-setup/env-manifest.js";
import {
  type ConfigurableSetting,
  getConfigurableSettings,
  getSettingSpecs,
} from "../../lib/configurable-settings.js";
import { createSupabaseClientFromConfig } from "../../security/auth-stores/supabase.js";
import { jsonApiError, jsonApiSuccess } from "./api-response.js";
import { requirePlatformSuperAdmin, requireSuperAdmin } from "./authz.js";

/** Path the connections module serves the OAuth callback on. */
const OAUTH_CALLBACK_PATH = "/api/connections/oauth/callback";

/**
 * Public origin of this installation. Deploys set ENGENTY_API_BASE_URL to
 * PUBLIC_APP_URL (single origin behind the edge gateway); dev sets both.
 */
export function publicApiBaseUrl(): string {
  const raw =
    process.env.ENGENTY_API_BASE_URL?.trim() ||
    process.env.PUBLIC_APP_URL?.trim() ||
    "";
  return raw.replace(/\/$/, "");
}

/**
 * The env manifest writes provider instructions against
 * `<ENGENTY_API_BASE_URL>` because it has no runtime origin. Resolve it here so
 * the setup UI shows the literal URL an operator pastes into a provider console.
 */
export function expandPlaceholders(text: string): string {
  const base = publicApiBaseUrl();
  return base ? text.replaceAll("<ENGENTY_API_BASE_URL>", base) : text;
}

/**
 * CONNECTIONS_REDIRECT_URI wins when set (core behind a proxy on a different
 * origin); otherwise the callback sits on the public origin.
 */
export function resolveOAuthRedirectUri(
  override?: string | null
): string | null {
  const configured = override?.trim();
  if (configured) {
    return configured;
  }
  const base = publicApiBaseUrl();
  return base ? `${base}${OAUTH_CALLBACK_PATH}` : null;
}

/**
 * Providers only accept public hostnames, plus the loopback exceptions
 * `localhost` and `127.0.0.1`. Portless dev serves the app on `*.localhost`
 * subdomains, which Google (and most others) reject outright — worth warning
 * about instead of letting an operator paste a URL that can never be saved.
 */
export function isProviderRejectedRedirectHost(uri: string | null): boolean {
  if (!uri) {
    return false;
  }
  let host: string;
  try {
    host = new URL(uri).hostname.toLowerCase();
  } catch {
    return false;
  }
  return host !== "localhost" && host.endsWith(".localhost");
}

/**
 * Loopback fallback for local dev: core's own origin, which providers do
 * accept. Register this and point CONNECTIONS_REDIRECT_URI at it.
 */
export function loopbackRedirectUri(): string | null {
  const raw = process.env.ENGENTY_CORE_BASE_URL?.trim();
  if (!raw) {
    return null;
  }
  try {
    return `${new URL(raw).origin}${OAUTH_CALLBACK_PATH}`;
  } catch {
    return null;
  }
}

function expandObtain(
  obtain: ConfigurableSetting["obtain"]
): ConfigurableSetting["obtain"] {
  if (!obtain.instructions) {
    return obtain;
  }
  return {
    ...obtain,
    instructions: obtain.instructions.map(expandPlaceholders),
  };
}

/**
 * Deploy-scope keys that no UI can write: services read them from their own
 * process env at boot (app-host never touches the settings DB), and the token
 * encryption key must not live in the database whose rows it encrypts. Showing
 * their presence still beats discovering a missing one in the container logs.
 */
interface DeploymentEnvView {
  description: string;
  feature?: string;
  group: string;
  /** Non-empty in core's own environment. Values are never returned. */
  isSet: boolean;
  key: string;
  required: "always" | "feature" | "optional";
  secret: boolean;
}

function deploymentEnvStatus(): DeploymentEnvView[] {
  return getEnvManifest()
    .filter((spec) => spec.scopes.includes("deploy") && !spec.configurable)
    .map((spec) => ({
      description: expandPlaceholders(spec.description),
      ...(spec.feature ? { feature: spec.feature } : {}),
      group: spec.group,
      isSet: Boolean(process.env[spec.key]?.trim()),
      key: spec.key,
      required: spec.required,
      secret: spec.secret,
    }));
}

/** Install-wide facts the setup UI shows alongside the settings themselves. */
interface SettingsContext {
  /** Public origin; "" when neither base-URL env is set. */
  apiBaseUrl: string;
  /** Loopback alternative to offer when the redirect host is unusable. */
  loopbackRedirectUri: string | null;
  /** Redirect/callback URL to register with every OAuth provider, or null. */
  oauthRedirectUri: string | null;
  /** The redirect host is one providers refuse (a `*.localhost` subdomain). */
  redirectHostRejected: boolean;
}

interface SettingView {
  configurable: "platform" | "tenant";
  description: string;
  feature?: string;
  group: string;
  /** A DB row exists at this scope (i.e. env is overridden here). */
  isSet: boolean;
  key: string;
  obtain: ConfigurableSetting["obtain"];
  required: ConfigurableSetting["required"];
  secret: boolean;
  source: string;
  type: ConfigurableSetting["type"];
  updatedAt: string | null;
  updatedBy: string | null;
  /** Present for non-secret settings only; secrets are write-only. */
  value?: string | null;
}

function toView(
  spec: ConfigurableSetting,
  source: string,
  resolvedValue: string | undefined,
  row: { updatedAt: string; updatedBy: string | null } | null
): SettingView {
  const base: SettingView = {
    key: spec.key,
    group: spec.group,
    description: expandPlaceholders(spec.description),
    obtain: expandObtain(spec.obtain),
    required: spec.required,
    feature: spec.feature,
    secret: spec.secret,
    configurable: spec.configurable,
    type: spec.type,
    source,
    isSet: row !== null,
    updatedAt: row?.updatedAt ?? null,
    updatedBy: row?.updatedBy ?? null,
  };
  if (!spec.secret) {
    base.value = resolvedValue ?? null;
  }
  return base;
}

type BuildResult =
  | { ok: true; input: PlatformSettingInput }
  | { ok: false; message: string };

/** Coerce a raw string body value into a typed setting input, with validation. */
function buildInput(
  spec: ConfigurableSetting,
  rawValue: string,
  updatedBy: string | null
): BuildResult {
  if (spec.validate) {
    const err = spec.validate(rawValue);
    if (err) {
      return { ok: false, message: err };
    }
  }
  const name = spec.key;
  switch (spec.type) {
    case "secret":
      return {
        ok: true,
        input: { name, type: "secret", secretValue: rawValue, updatedBy },
      };
    case "string":
      return {
        ok: true,
        input: { name, type: "string", value_string: rawValue, updatedBy },
      };
    case "boolean": {
      if (rawValue !== "true" && rawValue !== "false") {
        return {
          ok: false,
          message: "Boolean value must be 'true' or 'false'",
        };
      }
      return {
        ok: true,
        input: {
          name,
          type: "boolean",
          value_boolean: rawValue === "true",
          updatedBy,
        },
      };
    }
    case "numeric": {
      const n = Number(rawValue);
      if (Number.isNaN(n)) {
        return { ok: false, message: "Value must be a number" };
      }
      return {
        ok: true,
        input: { name, type: "numeric", value_numeric: n, updatedBy },
      };
    }
    case "json": {
      try {
        return {
          ok: true,
          input: {
            name,
            type: "json",
            value_jsonb: JSON.parse(rawValue),
            updatedBy,
          },
        };
      } catch {
        return { ok: false, message: "Value must be valid JSON" };
      }
    }
    default:
      return { ok: false, message: `Unsupported type: ${String(spec.type)}` };
  }
}

async function readValue(c: {
  req: { json: () => Promise<unknown> };
}): Promise<string | { error: string }> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return { error: "Invalid JSON body" };
  }
  const value = (body as { value?: unknown } | null)?.value;
  if (typeof value !== "string") {
    return { error: "Body must be { value: string }" };
  }
  return value;
}

export function registerPlatformSettingsRoutes(params: {
  app: OpenAPIHono;
  config: Record<string, unknown>;
}) {
  const { app, config } = params;
  const supabase = createSupabaseClientFromConfig(config);
  if (!supabase) {
    // No DB configured (e.g. a degraded boot) — the store is unavailable; the
    // resolver everywhere else still falls back to env, so skip route wiring.
    return;
  }
  const logger = createLogger({ name: "platform-settings" });
  const repo = createPlatformSettingsRepoSupabase(supabase, {
    logger: (msg, err) => logger.warn(msg, err),
  });
  const resolver: SettingsResolver = createSettingsResolver({
    repo,
    specs: getSettingSpecs(),
  });

  const specByKey = new Map(getConfigurableSettings().map((s) => [s.key, s]));

  async function settingsContext(
    tenantId?: string | null
  ): Promise<SettingsContext> {
    // CONNECTIONS_REDIRECT_URI is a deploy-scope var, not DB-configurable in
    // most builds — the resolver only knows configurable keys, so fall back to
    // the environment the same way the connections module itself does.
    const override = specByKey.has("CONNECTIONS_REDIRECT_URI")
      ? (
          await resolver.resolveSettingMeta("CONNECTIONS_REDIRECT_URI", {
            tenantId,
          })
        ).value
      : process.env.CONNECTIONS_REDIRECT_URI;
    const oauthRedirectUri = resolveOAuthRedirectUri(override);
    return {
      apiBaseUrl: publicApiBaseUrl(),
      loopbackRedirectUri: loopbackRedirectUri(),
      oauthRedirectUri,
      redirectHostRejected: isProviderRejectedRedirectHost(oauthRedirectUri),
    };
  }

  // ── Platform scope (superadmin) ───────────────────────────────────────────
  app.get("/api/platform-settings", async (c) => {
    const authResult = await requirePlatformSuperAdmin(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const rows = await repo.listPlatform();
    const byName = new Map(rows.map((r) => [r.name, r]));
    const settings = await Promise.all(
      getConfigurableSettings().map(async (spec) => {
        const meta = await resolver.resolveSettingMeta(spec.key);
        const row = byName.get(spec.key) ?? null;
        return toView(spec, meta.source, meta.value, row);
      })
    );
    return jsonApiSuccess(c, {
      context: await settingsContext(null),
      deploymentEnv: deploymentEnvStatus(),
      settings,
    });
  });

  app.patch("/api/platform-settings/:key", async (c) => {
    const authResult = await requirePlatformSuperAdmin(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const key = c.req.param("key");
    const spec = specByKey.get(key);
    if (!spec) {
      return jsonApiError(c, 404, { message: `Unknown setting: ${key}` });
    }
    const value = await readValue(c);
    if (typeof value !== "string") {
      return jsonApiError(c, 400, { message: value.error });
    }
    const built = buildInput(spec, value, authResult.auth.userId);
    if (!built.ok) {
      return jsonApiError(c, 400, { message: built.message });
    }
    await repo.setPlatform(built.input);
    resolver.invalidate(key);
    const meta = await resolver.resolveSettingMeta(key);
    const row = await repo.getPlatform(key);
    return jsonApiSuccess(c, {
      setting: toView(spec, meta.source, meta.value, row),
    });
  });

  app.delete("/api/platform-settings/:key", async (c) => {
    const authResult = await requirePlatformSuperAdmin(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const key = c.req.param("key");
    const spec = specByKey.get(key);
    if (!spec) {
      return jsonApiError(c, 404, { message: `Unknown setting: ${key}` });
    }
    await repo.deletePlatform(key);
    resolver.invalidate(key);
    const meta = await resolver.resolveSettingMeta(key);
    return jsonApiSuccess(c, {
      setting: toView(spec, meta.source, meta.value, null),
    });
  });

  // ── Tenant overrides (tenant admin, own tenant) ───────────────────────────
  app.get("/api/tenant-settings-overrides", async (c) => {
    const authResult = await requireSuperAdmin(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const tenantId = authResult.auth.tenantId;
    if (!tenantId) {
      return jsonApiError(c, 400, { message: "No tenant in context" });
    }
    const rows = await repo.listTenantOverrides(tenantId);
    const byName = new Map(rows.map((r) => [r.name, r]));
    const settings = await Promise.all(
      getConfigurableSettings()
        .filter((s) => s.configurable === "tenant")
        .map(async (spec) => {
          const meta = await resolver.resolveSettingMeta(spec.key, {
            tenantId,
          });
          const row = byName.get(spec.key) ?? null;
          return toView(spec, meta.source, meta.value, row);
        })
    );
    return jsonApiSuccess(c, {
      context: await settingsContext(tenantId),
      settings,
    });
  });

  app.patch("/api/tenant-settings-overrides/:key", async (c) => {
    const authResult = await requireSuperAdmin(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const tenantId = authResult.auth.tenantId;
    if (!tenantId) {
      return jsonApiError(c, 400, { message: "No tenant in context" });
    }
    const key = c.req.param("key");
    const spec = specByKey.get(key);
    if (spec?.configurable !== "tenant") {
      return jsonApiError(c, 404, {
        message: `Setting not tenant-configurable: ${key}`,
      });
    }
    const value = await readValue(c);
    if (typeof value !== "string") {
      return jsonApiError(c, 400, { message: value.error });
    }
    const built = buildInput(spec, value, authResult.auth.userId);
    if (!built.ok) {
      return jsonApiError(c, 400, { message: built.message });
    }
    await repo.setTenantOverride(tenantId, built.input);
    resolver.invalidate(key);
    const meta = await resolver.resolveSettingMeta(key, { tenantId });
    const row = await repo.getTenantOverride(tenantId, key);
    return jsonApiSuccess(c, {
      setting: toView(spec, meta.source, meta.value, row),
    });
  });

  app.delete("/api/tenant-settings-overrides/:key", async (c) => {
    const authResult = await requireSuperAdmin(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const tenantId = authResult.auth.tenantId;
    if (!tenantId) {
      return jsonApiError(c, 400, { message: "No tenant in context" });
    }
    const key = c.req.param("key");
    const spec = specByKey.get(key);
    if (spec?.configurable !== "tenant") {
      return jsonApiError(c, 404, {
        message: `Setting not tenant-configurable: ${key}`,
      });
    }
    await repo.deleteTenantOverride(tenantId, key);
    resolver.invalidate(key);
    const meta = await resolver.resolveSettingMeta(key, { tenantId });
    const row = await repo.getTenantOverride(tenantId, key);
    return jsonApiSuccess(c, {
      setting: toView(spec, meta.source, meta.value, row),
    });
  });
}
