/**
 * The classifier for module code (inbox categories, the KB search verifier):
 * the tenant's `ai.config.classifier_model_id`, else the platform `classifier`
 * binding — the same chain `apps/ai` resolves for a run — turned into a client
 * by {@link createClassifierClient}.
 */

import { createTenantSettingsRepoSupabase } from "@engenty/tenant-settings";
import { resolvePurposeModelId } from "../config/model-purposes.js";
import {
  parseTenantAiSettings,
  TENANT_AI_CONFIG_KEY,
} from "../tenant-ai-settings.js";
import {
  type ClassifierClientOptions,
  createClassifierClient,
  type ResolvedClassifier,
} from "./classifier-client.js";

export interface ModuleClassifierSource {
  scopeId?: string | null;
  /** Tenant-locked client for `core.tenant_settings`. */
  tenantDb: unknown;
  tenantId: string;
}

async function loadTenantClassifierModelId(
  source: ModuleClassifierSource
): Promise<string | null> {
  try {
    const repo = createTenantSettingsRepoSupabase(
      source.tenantDb,
      source.tenantId,
      source.scopeId ?? "default"
    );
    const row = await repo.get(TENANT_AI_CONFIG_KEY);
    return (
      parseTenantAiSettings(row?.value).classifier_model_id?.trim() || null
    );
  } catch {
    // An unreadable tenant setting leaves the platform binding in charge.
    return null;
  }
}

export async function resolveModuleClassifierModelId(
  source: ModuleClassifierSource
): Promise<string> {
  return resolvePurposeModelId({
    purpose: "classifier",
    tenantDefault: await loadTenantClassifierModelId(source),
  });
}

/** The tenant's classifier client, or null when its model has no credential. */
export async function resolveModuleClassifier(
  source: ModuleClassifierSource,
  options: ClassifierClientOptions = {}
): Promise<ResolvedClassifier | null> {
  return createClassifierClient(
    await resolveModuleClassifierModelId(source),
    options
  );
}
