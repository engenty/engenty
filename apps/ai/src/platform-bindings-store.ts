import { bindingsFromList, type ModelBindings } from "@engenty/ai-core";
import type { AiGatewayModelStore } from "./gateway-models.js";

/** The platform bindings as the process snapshot holds them. */
export async function readStoreBindings(
  store: Pick<AiGatewayModelStore, "listModelBindings">
): Promise<ModelBindings | undefined> {
  const rows = await store.listModelBindings("platform");
  if (rows.length === 0) {
    return;
  }
  return bindingsFromList(
    rows.map((row) => ({
      gateway: row.gateway,
      modelId: row.model_id,
      role: row.role,
    }))
  );
}
