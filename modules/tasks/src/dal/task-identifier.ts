import type { SupabaseClient } from "@supabase/supabase-js";
import { formatTaskIdentifier } from "../domain/task-lifecycle.js";

const SCHEMA = "module_tasks";

export async function allocateTaskIdentifier(
  supabase: SupabaseClient,
  tenantId: string,
  scopeId: string,
  prefix: string
): Promise<string> {
  const normalizedPrefix = prefix
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (!normalizedPrefix) {
    throw new Error("task_identifier_prefix_required");
  }

  const sequences = () =>
    supabase.schema(SCHEMA).from("task_identifier_sequences");

  const { data: existing, error: selectError } = await sequences()
    .select("last_value")
    .eq("tenant_id", tenantId)
    .eq("scope_id", scopeId)
    .eq("prefix", normalizedPrefix)
    .maybeSingle();

  if (selectError) {
    throw new Error(
      `Failed to read task identifier sequence: ${selectError.message}`
    );
  }

  const nextValue = (existing?.last_value ?? 0) + 1;

  const { error: upsertError } = await sequences().upsert(
    {
      tenant_id: tenantId,
      scope_id: scopeId,
      prefix: normalizedPrefix,
      last_value: nextValue,
    },
    { onConflict: "tenant_id,scope_id,prefix" }
  );

  if (upsertError) {
    throw new Error(
      `Failed to update task identifier sequence: ${upsertError.message}`
    );
  }

  return formatTaskIdentifier(normalizedPrefix, nextValue);
}
