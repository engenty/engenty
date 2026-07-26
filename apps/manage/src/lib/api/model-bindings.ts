import { requestAi } from "./http";

/**
 * Role bindings: which model does which job.
 *
 * This is the answer to "where is it defined which model is used?" — a question
 * that previously had no answer anywhere in the product, only in the database.
 */
export interface ModelRoleBinding {
  /** False when the role has never been bound and is running on its seed. */
  bound: boolean;
  /** Module that declared the role; null for platform roles. */
  declared_by: string | null;
  default_model_id: string;
  gateway: string;
  label: string;
  model_id: string;
  role: string;
  surface: "graded" | "fixed";
  updated_at: string | null;
}

export function listModelBindings(signal?: AbortSignal) {
  return requestAi<{ items: ModelRoleBinding[] }>("/ai/v1/models/bindings", {
    signal,
  }).then((r) => r.items);
}

export function bindModelRole(
  role: string,
  modelId: string,
  gateway = "vercel"
) {
  return requestAi<ModelRoleBinding>(
    `/ai/v1/models/bindings/${encodeURIComponent(role)}`,
    { method: "PATCH", body: { gateway, model_id: modelId } }
  );
}
