// GET /ai/v1/settings/effective — resolved AI model + caps settings with
// provenance, for the tenant-admin AI settings page. Every value is resolved
// along tenant → platform(env) → default (no session/agent layer here — this is
// the tenant-configuration view). Platform-scoped overrides are already in
// process.env via @engenty/platform-settings boot hydration, so the env layer
// reflects them.

import {
  AI_MODEL_PURPOSE_SPECS,
  AI_MODEL_PURPOSES,
  type AiModelPurpose,
  type AiSettingSource,
  parseTenantAiSettings,
  resolvePurposeModel,
  TENANT_AI_CONFIG_KEY,
  type TenantAiSettings,
} from "@engenty/ai-core";
import { createLogger } from "@engenty/telemetry";
import { createTenantSettingsRepoSupabase } from "@engenty/tenant-settings";
import type { Hono } from "hono";
import { resolveAgentMaxStepsWithSource } from "../ai/sessions/max-steps.js";
import { AI_BASE_PATH } from "../config/constants.js";
import { createAiDatabaseAdapter } from "../infra/database.js";
import { type AiScopeResolver, resolveScope } from "./http.js";

const logger = createLogger({ name: "apps/ai/settings-routes" });

interface ResolvedModelEntry {
  /** What the value would be if the tenant pin were cleared (platform/default). */
  inherited: { value: string; source: AiSettingSource };
  source: AiSettingSource;
  /** Raw tenant-pinned value, or null when inheriting. */
  tenant: string | null;
  /** Effective model id (tenant → platform → default). */
  value: string;
}

function readEnv(key: string): string | undefined {
  return process.env[key];
}

function tenantFieldValue(
  settings: TenantAiSettings,
  purpose: AiModelPurpose
): string | null {
  const field = AI_MODEL_PURPOSE_SPECS[purpose].tenantField;
  const value = settings[field];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function resolveModelEntry(
  settings: TenantAiSettings,
  purpose: AiModelPurpose
): ResolvedModelEntry {
  const tenant = tenantFieldValue(settings, purpose);
  const effective = resolvePurposeModel({
    purpose,
    tenantDefault: tenant,
    readEnv,
  });
  const inherited = resolvePurposeModel({ purpose, readEnv });
  return {
    value: effective.value,
    source: effective.source,
    tenant,
    inherited: { value: inherited.value, source: inherited.source },
  };
}

async function loadTenantSettings(tenantId: string): Promise<TenantAiSettings> {
  const adapter = createAiDatabaseAdapter();
  if (!adapter) {
    return {};
  }
  try {
    const repo = createTenantSettingsRepoSupabase(adapter, tenantId, "default");
    const row = await repo.get(TENANT_AI_CONFIG_KEY);
    return parseTenantAiSettings(row?.value);
  } catch (err) {
    logger.warn("failed to load tenant ai.config for effective settings", {
      err,
      tenantId,
    });
    return {};
  }
}

export function registerAiSettingsRoutes(
  app: Hono<any>,
  options: { scopeResolver: AiScopeResolver }
) {
  app.get(`${AI_BASE_PATH}/v1/settings/effective`, async (c) => {
    const resolved = await resolveScope(c, options.scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }

    const settings = await loadTenantSettings(resolved.scope.tenantId);

    const models: Record<string, ResolvedModelEntry> = {};
    for (const purpose of AI_MODEL_PURPOSES) {
      models[purpose] = resolveModelEntry(settings, purpose);
    }

    const tenantMaxSteps = settings.caps?.max_steps ?? null;
    const maxStepsEffective = resolveAgentMaxStepsWithSource({
      tenantDefault: tenantMaxSteps,
    });
    const maxStepsInherited = resolveAgentMaxStepsWithSource();

    return c.json({
      models,
      caps: {
        max_steps: {
          value: maxStepsEffective.value,
          source: maxStepsEffective.source,
          tenant: tenantMaxSteps,
          inherited: {
            value: maxStepsInherited.value,
            source: maxStepsInherited.source,
          },
        },
      },
      doc_converter: settings.doc_converter ?? null,
    });
  });
}
