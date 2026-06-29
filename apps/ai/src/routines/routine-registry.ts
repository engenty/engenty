// Assembles the effective routine set: builtin routines + module ROUTINE.md
// definitions from the core module-capability channel (tenant-scoped, same
// path module agents and actions use) + in-process registrations + DB customs.
import {
  type DynamicAiModuleCapabilityLoader,
  listRegisteredRoutines,
  type RoutineDefinition,
} from "@engenty/ai-core";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ResolvedRoutine {
  definition: RoutineDefinition;
  schedules?: string[];
  source?: "module" | "custom";
}

export async function listAllRoutines(
  db?: SupabaseClient | null,
  tenantId?: string,
  moduleLoader?: DynamicAiModuleCapabilityLoader
): Promise<ResolvedRoutine[]> {
  const seenIds = new Set<string>();
  const moduleDefinitions = [
    ...listRegisteredRoutines(),
    ...(moduleLoader
      ? (await moduleLoader.listModuleCapabilities()).flatMap(
          (capability) => capability.routines ?? []
        )
      : []),
  ];
  const moduleRoutines: ResolvedRoutine[] = [];
  for (const definition of moduleDefinitions) {
    if (seenIds.has(definition.id)) {
      continue;
    }
    seenIds.add(definition.id);
    moduleRoutines.push({ definition, source: "module" as const });
  }

  const declared = [...moduleRoutines];

  if (!(db && tenantId)) {
    return declared;
  }

  const { data, error } = await db
    .schema("ai")
    .from("custom_routine")
    .select("*")
    .eq("tenant_id", tenantId);

  if (error) {
    return declared;
  }

  const custom = (data ?? []).map((row) => {
    const schedules = Array.isArray(row.schedules) ? row.schedules : [];
    const definition: RoutineDefinition = {
      description: row.description ?? undefined,
      enabled_by_default: row.enabled,
      id: `custom:${row.id}`,
      module_id: "custom",
      name: row.name,
      quiet_hours: row.quiet_hours ?? null,
      schedule: schedules[0] ?? "",
      // A routine creates a Task (spec): the stored columns are reinterpreted —
      // name → title, prompt → task description, agent_id → assignee. No data
      // migration needed; the agent_prompt era is gone.
      target: {
        kind: "task_template",
        task_template: {
          agent_type_key: row.agent_id,
          description: row.prompt ?? undefined,
          title: row.name,
        },
      },
    };
    return {
      definition,
      schedules,
      source: "custom" as const,
    };
  });

  return [...declared, ...custom];
}

export async function resolveRoutineById(
  db: SupabaseClient | null,
  tenantId: string | undefined,
  routineId: string,
  moduleLoader?: DynamicAiModuleCapabilityLoader
): Promise<ResolvedRoutine | undefined> {
  const all = await listAllRoutines(db, tenantId, moduleLoader);
  return all.find((entry) => entry.definition.id === routineId);
}
