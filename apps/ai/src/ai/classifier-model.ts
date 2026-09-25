// The platform `classifier` binding, with no tenant layer: what a process asks
// before any tenant is in play (the boot-time connection warm-up).
import {
  bindingsFromList,
  type ModelBindings,
  ModelRoleNotBoundError,
  resolvePurposeModelId,
} from "@engenty/ai-core";
import type { AiGatewayModelStore } from "../gateway-models.js";
import { createAiUsageStoreFromEnv } from "./index.js";

/** Read platform bindings from the store; undefined when empty or unreadable. */
async function loadPlatformBindings(): Promise<ModelBindings | undefined> {
  try {
    const store = createAiUsageStoreFromEnv() as
      | (ReturnType<typeof createAiUsageStoreFromEnv> &
          Partial<AiGatewayModelStore>)
      | null;
    const rows = await store?.listModelBindings?.("platform");
    if (!(rows && rows.length > 0)) {
      return;
    }
    return bindingsFromList(
      rows.map((r) => ({
        gateway: r.gateway,
        modelId: r.model_id,
        role: r.role,
      }))
    );
  } catch {
    return;
  }
}

/**
 * The platform classifier ref. Returns null when the role is unbound (fresh DB
 * before seed) — boot must still listen and serve `/ai/health`.
 */
export async function resolvePlatformClassifierModelId(): Promise<
  string | null
> {
  try {
    // Classifier only — do not walk chat/fast_text. A fresh DB may still be
    // mid-seed, and resolving every purpose would throw on the first unbound
    // graded role and take the process down before `/ai/health` can answer.
    return resolvePurposeModelId({
      bindings: await loadPlatformBindings(),
      purpose: "classifier",
    });
  } catch (err) {
    if (err instanceof ModelRoleNotBoundError) {
      return null;
    }
    throw err;
  }
}
