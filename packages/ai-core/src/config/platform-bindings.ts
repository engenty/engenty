/**
 * Platform role bindings from `ai.model_binding`: the DB read that feeds the
 * process snapshot, and role → model ref.
 */
import { DEFAULT_MODEL_GATEWAY_ID, formatModelRef } from "./model-ref.js";
import { bindingsFromList, type ModelBindings } from "./model-roles.js";
import {
  platformBindings,
  requirePlatformBinding,
  startPlatformBindingsSync,
} from "./platform-bindings-snapshot.js";

interface BindingRow {
  gateway: string | null;
  model_id: string;
  role: string;
}

interface BindingReader {
  schema(name: string): {
    from(table: string): {
      select(columns: string): {
        eq(
          column: string,
          value: string
        ): PromiseLike<{ data: BindingRow[] | null; error: unknown }>;
      };
    };
  };
}

/** Read the platform bindings from `ai.model_binding`; undefined when empty. */
export async function readPlatformBindings(
  serviceDb: unknown
): Promise<ModelBindings | undefined> {
  if (!serviceDb || typeof serviceDb !== "object") {
    return;
  }
  const { data, error } = await (serviceDb as BindingReader)
    .schema("ai")
    .from("model_binding")
    .select("gateway, model_id, role")
    .eq("scope", "platform");
  if (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
  if (!data || data.length === 0) {
    return;
  }
  return bindingsFromList(
    data.map((row) => ({
      gateway: String(row.gateway ?? DEFAULT_MODEL_GATEWAY_ID),
      modelId: String(row.model_id),
      role: String(row.role),
    }))
  );
}

/** Keep this process's snapshot in sync with the table (apps/core, modules). */
export function syncPlatformBindingsFromDb(serviceDb: unknown) {
  return startPlatformBindingsSync(() => readPlatformBindings(serviceDb));
}

/** The model ref a role is bound to; throws when it is not bound. */
export function roleModelRef(role: string, bindings?: ModelBindings): string {
  const bound = requirePlatformBinding(role, bindings ?? platformBindings());
  return formatModelRef({ gateway: bound.gateway, modelId: bound.modelId });
}
