// GET /ai/v1/settings/effective — resolved AI model + caps settings with
// provenance, for the tenant-admin AI settings page. Models resolve tenant →
// platform role binding; caps resolve tenant → platform(env) → default (no
// session/agent layer here — this is the tenant-configuration view).

import {
  AI_MODEL_PURPOSE_TENANT_FIELDS,
  AI_MODEL_PURPOSES,
  type AiModelPurpose,
  type AiSettingSource,
  parseTenantAiSettings,
  resolvePurposeModel,
  TENANT_AI_CONFIG_KEY,
  type TenantAiSettings,
} from "@engenty/ai-core";
import type {
  AgentApprovalMode,
  ComputerNetworkTier,
} from "@engenty/plugin-sdk";
import { createLogger } from "@engenty/telemetry";
import { createTenantSettingsRepoSupabase } from "@engenty/tenant-settings";
import type { Hono } from "hono";
import { resolveSpaceComputerNetworkTier } from "../ai/sandbox/sandbox-env.js";
import {
  resolveAgentMaxStepsWithSource,
  type SettingSource,
} from "../ai/sessions/max-steps.js";
import { AI_BASE_PATH } from "../config/constants.js";
import { getTenantDbFactoryFromEnv } from "../infra/tenant-db.js";
import { type AiScopeResolver, resolveScope } from "./http.js";

const logger = createLogger({ name: "apps/ai/settings-routes" });

interface ResolvedModelEntry {
  /** What the value would be if the tenant pin were cleared (the binding). */
  inherited: { value: string; source: AiSettingSource };
  source: AiSettingSource;
  /** Raw tenant-pinned value, or null when inheriting. */
  tenant: string | null;
  /** Effective model id (tenant → platform binding). */
  value: string;
}

function tenantFieldValue(
  settings: TenantAiSettings,
  purpose: AiModelPurpose
): string | null {
  const field = AI_MODEL_PURPOSE_TENANT_FIELDS[purpose];
  const value = settings[field];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function resolveModelEntry(
  settings: TenantAiSettings,
  purpose: AiModelPurpose
): ResolvedModelEntry {
  const tenant = tenantFieldValue(settings, purpose);
  const effective = resolvePurposeModel({ purpose, tenantDefault: tenant });
  const inherited = resolvePurposeModel({ purpose });
  return {
    value: effective.value,
    source: effective.source,
    tenant,
    inherited: { value: inherited.value, source: inherited.source },
  };
}

async function loadTenantSettings(tenantId: string): Promise<TenantAiSettings> {
  // Phase A seam: core.tenant_settings is tenant-keyed — read on a
  // tenant-locked handle minted for the requesting scope's tenant.
  const factory = getTenantDbFactoryFromEnv();
  if (!factory) {
    return {};
  }
  try {
    const repo = createTenantSettingsRepoSupabase(
      factory.getTenantDb({ tenantId }),
      tenantId,
      "default"
    );
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
      // What a space's "Default" approval row actually resolves to — inherit
      // is a named choice, not a ceiling.
      agent_approval: {
        mode: approvalModeEntry(settings.agent_approval?.mode ?? null),
      },
      // What a space's "Host default" computer-reach row resolves to. Env
      // only: the machine is one per space and its network is fixed by
      // whichever run creates it, so there is no tenant layer to read.
      space_computer: { network: spaceComputerNetworkEntry() },
    });
  });
}

interface ResolvedApprovalModeEntry {
  source: SettingSource;
  /** Raw tenant-pinned mode, or null when nothing is set. */
  tenant: AgentApprovalMode | null;
  value: AgentApprovalMode;
}

function approvalModeEntry(
  tenant: AgentApprovalMode | null
): ResolvedApprovalModeEntry {
  return {
    source: tenant ? "tenant" : "default",
    tenant,
    value: tenant ?? "manual",
  };
}

interface ResolvedNetworkTierEntry {
  source: SettingSource;
  value: ComputerNetworkTier;
}

function spaceComputerNetworkEntry(): ResolvedNetworkTierEntry {
  const pinned = process.env.ENGENTY_SPACE_COMPUTER_NETWORK_TIER?.trim();
  return {
    source: pinned === "none" || pinned === "egress" ? "platform" : "default",
    value: resolveSpaceComputerNetworkTier(),
  };
}
