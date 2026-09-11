import {
  createTenantSettingsRepoSupabase,
  type TenantSettingValue,
} from "@engenty/tenant-settings";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  definitionsToSettingsSlice,
  mergeTaskStatusDefinitionsFromPayload,
  normalizeTaskStatusDefinitionsFromStorage,
} from "../lib/task-status-settings.js";
import type {
  TaskSettings,
  TaskSettingsUpdateInput,
  TaskStatusDefinition,
} from "../schema/types.js";

/** Typed-KV keys on `core.tenant_settings` (replaces `module_tasks.tenant_settings`). */
export const TASKS_TENANT_SETTING = {
  identifierPrefix: "tasks.identifier_prefix",
  staleAfterDays: "tasks.stale_after_days",
  statusDefinitions: "tasks.status_definitions",
} as const;

export const TASKS_TENANT_SETTING_PREFIX = "tasks.";

export const DEFAULT_TASK_IDENTIFIER_PREFIX = "ENG";
export const DEFAULT_TASK_STALE_AFTER_DAYS = 7;

export function taskSettingsFromTenantKv(
  rows: Array<{ name: string; value: unknown }>
): TaskSettings {
  const byName = new Map(rows.map((row) => [row.name, row.value]));
  const prefixRaw = byName.get(TASKS_TENANT_SETTING.identifierPrefix);
  const identifier_prefix =
    typeof prefixRaw === "string" && prefixRaw.trim()
      ? prefixRaw.trim()
      : DEFAULT_TASK_IDENTIFIER_PREFIX;
  const staleParsed = Number(
    byName.get(TASKS_TENANT_SETTING.staleAfterDays) ??
      DEFAULT_TASK_STALE_AFTER_DAYS
  );
  const stale_after_days =
    Number.isFinite(staleParsed) && staleParsed >= 1
      ? Math.trunc(staleParsed)
      : DEFAULT_TASK_STALE_AFTER_DAYS;
  const definitions = normalizeTaskStatusDefinitionsFromStorage(
    unwrapStatusDefinitions(byName.get(TASKS_TENANT_SETTING.statusDefinitions))
  );
  return {
    identifier_prefix,
    stale_after_days,
    ...definitionsToSettingsSlice(definitions),
  };
}

export function taskSettingsToTenantKv(settings: {
  identifier_prefix: string;
  stale_after_days: number;
  task_status_definitions: TaskStatusDefinition[];
}): TenantSettingValue[] {
  return [
    {
      name: TASKS_TENANT_SETTING.identifierPrefix,
      type: "string",
      value_string: settings.identifier_prefix,
    },
    {
      name: TASKS_TENANT_SETTING.staleAfterDays,
      type: "numeric",
      value_numeric: settings.stale_after_days,
    },
    {
      name: TASKS_TENANT_SETTING.statusDefinitions,
      type: "json",
      value_jsonb: { items: settings.task_status_definitions },
    },
  ];
}

export function mergeTaskSettingsUpdate(
  current: TaskSettings,
  input: TaskSettingsUpdateInput
): TaskSettings {
  const definitions = input.task_status_definitions
    ? mergeTaskStatusDefinitionsFromPayload(input.task_status_definitions)
    : current.task_status_definitions;
  return {
    identifier_prefix:
      input.identifier_prefix?.trim() || current.identifier_prefix,
    stale_after_days: input.stale_after_days ?? current.stale_after_days,
    ...definitionsToSettingsSlice(definitions),
  };
}

export function createTaskSettingsStore(
  supabase: SupabaseClient,
  tenantId: string,
  scopeId: string
) {
  const repo = createTenantSettingsRepoSupabase(supabase, tenantId, scopeId);

  return {
    async get(): Promise<TaskSettings> {
      const rows = await repo.list(TASKS_TENANT_SETTING_PREFIX);
      return taskSettingsFromTenantKv(rows);
    },

    async update(input: TaskSettingsUpdateInput): Promise<TaskSettings> {
      const next = mergeTaskSettingsUpdate(await this.get(), input);
      await repo.setMany(taskSettingsToTenantKv(next));
      return next;
    },
  };
}

function unwrapStatusDefinitions(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value;
  }
  if (
    value &&
    typeof value === "object" &&
    Array.isArray((value as { items?: unknown }).items)
  ) {
    return (value as { items: unknown[] }).items;
  }
  return value;
}
