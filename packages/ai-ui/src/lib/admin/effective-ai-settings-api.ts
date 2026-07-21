// Client for GET /ai/v1/settings/effective — resolved AI model + caps values
// with provenance, used by the AI settings model matrix to show the effective
// value and whether it is tenant-pinned or inherited.

import type {
  AiModelPurpose,
  AiSettingSource,
  DocConverterTenantPrefs,
} from "@engenty/ai-core/browser";
import { getCurrentAccessToken, requestApiJson } from "@engenty/api-client";
import { getAiServiceBaseUrl } from "../runtime/ai-service-client.js";

export interface EffectiveModelEntry {
  inherited: { value: string; source: AiSettingSource };
  source: AiSettingSource;
  tenant: string | null;
  value: string;
}

export interface EffectiveMaxStepsEntry {
  inherited: { value: number; source: AiSettingSource };
  source: AiSettingSource;
  tenant: number | null;
  value: number;
}

export interface EffectiveAiSettings {
  caps: { max_steps: EffectiveMaxStepsEntry };
  doc_converter: DocConverterTenantPrefs | null;
  models: Record<AiModelPurpose, EffectiveModelEntry>;
}

export async function getEffectiveAiSettings(
  signal?: AbortSignal
): Promise<EffectiveAiSettings> {
  const baseUrl = getAiServiceBaseUrl();
  if (!baseUrl) {
    throw new Error("Missing VITE_ENGENTY_AI_BASE_URL");
  }
  return await requestApiJson<EffectiveAiSettings>(
    "/ai/v1/settings/effective",
    {
      authToken: (await getCurrentAccessToken()) ?? undefined,
      baseUrl,
      signal,
    }
  );
}
