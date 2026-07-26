import { getCurrentAccessToken, requestApiJson } from "@engenty/api-client";
import { getAiServiceBaseUrl } from "../runtime/ai-service-client.js";

/**
 * Which model backs each effort tier.
 *
 * Read-only for a tenant admin — bindings are a platform decision — but shown
 * rather than hidden: "medium" is meaningless without knowing what medium runs,
 * and a screen full of greyed checkboxes that answers no question at all is
 * worse than one that answers a question you cannot change.
 */
export interface ModelRoleBinding {
  bound: boolean;
  declared_by: string | null;
  default_model_id: string;
  gateway: string;
  label: string;
  model_id: string;
  role: string;
  surface: "graded" | "fixed";
  updated_at: string | null;
}

export async function listModelRoleBindings(signal?: AbortSignal) {
  const baseUrl = getAiServiceBaseUrl();
  if (!baseUrl) {
    throw new Error("Missing VITE_ENGENTY_AI_BASE_URL");
  }
  return await requestApiJson<{
    editable: boolean;
    items: ModelRoleBinding[];
  }>("/ai/v1/models/bindings", {
    authToken: (await getCurrentAccessToken()) ?? undefined,
    baseUrl,
    signal,
  });
}
