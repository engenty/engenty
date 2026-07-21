import {
  createPlatformSettingsRepoSupabase,
  createSettingsResolver,
  type PlatformSettingInput,
  type SettingsResolver,
} from "@engenty/platform-settings";
import { createLogger } from "@engenty/telemetry";
import type { OpenAPIHono } from "@hono/zod-openapi";
import {
  type ConfigurableSetting,
  getConfigurableSettings,
  getSettingSpecs,
} from "../../lib/configurable-settings.js";
import { createSupabaseClientFromConfig } from "../../security/auth-stores/supabase.js";
import { jsonApiError, jsonApiSuccess } from "./api-response.js";
import { requirePlatformSuperAdmin, requireSuperAdmin } from "./authz.js";

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
    description: spec.description,
    obtain: spec.obtain,
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
    return jsonApiSuccess(c, { settings });
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
    return jsonApiSuccess(c, { settings });
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
