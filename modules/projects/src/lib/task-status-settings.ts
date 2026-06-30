import {
  BUILTIN_TASK_STATUS_DEFINITIONS,
  TASK_STATUS_IDS_NON_DELETABLE,
} from "../../task-status-builtins.js";
import type { TaskStatusColor } from "../schema/task-status-colors.js";
import { TASK_STATUS_COLOR_OPTIONS } from "../schema/task-status-colors.js";
import type {
  ProjectSettings,
  ProjectTaskStatusDefinition,
} from "../schema/types.js";

const BUILTIN_BY_ID = new Map(
  BUILTIN_TASK_STATUS_DEFINITIONS.map((d) => [d.id, d])
);

/** Required ids (append if missing after load/save). */
const REQUIRED_STATUS_ORDER = ["todo", "in_progress", "done"] as const;

function isNonDeletableTaskStatusId(id: string): boolean {
  return TASK_STATUS_IDS_NON_DELETABLE.has(id);
}

const COLOR_SET = new Set<TaskStatusColor>(TASK_STATUS_COLOR_OPTIONS);

function isTaskStatusColor(v: unknown): v is TaskStatusColor {
  return typeof v === "string" && COLOR_SET.has(v as TaskStatusColor);
}

function parseDefinitionRow(row: unknown): ProjectTaskStatusDefinition | null {
  if (!row || typeof row !== "object") {
    return null;
  }
  const r = row as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id.trim() : "";
  if (!(id && /^[a-z][a-z0-9_]{0,63}$/.test(id))) {
    return null;
  }
  const labelRaw = typeof r.label === "string" ? r.label.trim() : "";
  const label = labelRaw || id;
  const color: TaskStatusColor = isTaskStatusColor(r.color) ? r.color : "slate";
  const locked = isNonDeletableTaskStatusId(id);
  return { id, label, color, locked };
}

function mergeDefinitionWithBuiltin(
  d: ProjectTaskStatusDefinition
): ProjectTaskStatusDefinition {
  const base = BUILTIN_BY_ID.get(d.id);
  const locked = isNonDeletableTaskStatusId(d.id);
  if (base) {
    return {
      ...base,
      label: d.label,
      color: d.color,
      locked,
    };
  }
  return { ...d, locked };
}

/** Append todo / in_progress / done if absent (schema invariant). */
function appendMissingRequiredStatuses(
  ordered: ProjectTaskStatusDefinition[],
  seen: Set<string>
): ProjectTaskStatusDefinition[] {
  const next = [...ordered];
  for (const id of REQUIRED_STATUS_ORDER) {
    if (!seen.has(id)) {
      const b = BUILTIN_BY_ID.get(id);
      if (b) {
        next.push({ ...b, locked: true });
        seen.add(id);
      }
    }
  }
  return next;
}

/**
 * Normalize JSON from project_settings.default_task_statuses_json.
 * Expects `ProjectTaskStatusDefinition[]` shape; order matches stored array order.
 * Non-arrays, empty arrays, and arrays with no valid definition rows yield full builtins.
 */
export function normalizeTaskStatusDefinitionsFromStorage(
  raw: string | null | undefined
): ProjectTaskStatusDefinition[] {
  let parsed: unknown;
  try {
    parsed = raw ? JSON.parse(raw) : [];
  } catch {
    parsed = [];
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return BUILTIN_TASK_STATUS_DEFINITIONS.map((d) => ({ ...d }));
  }

  const seen = new Set<string>();
  const ordered: ProjectTaskStatusDefinition[] = [];
  for (const row of parsed) {
    const def = parseDefinitionRow(row);
    if (!def || seen.has(def.id)) {
      continue;
    }
    seen.add(def.id);
    ordered.push(mergeDefinitionWithBuiltin(def));
  }
  if (ordered.length === 0) {
    return BUILTIN_TASK_STATUS_DEFINITIONS.map((d) => ({ ...d }));
  }
  return appendMissingRequiredStatuses(ordered, seen);
}

export function definitionsToSettingsSlice(
  definitions: ProjectTaskStatusDefinition[]
): Pick<ProjectSettings, "default_task_statuses" | "task_status_definitions"> {
  return {
    task_status_definitions: definitions.map((d) => ({ ...d })),
    default_task_statuses: definitions.map((d) => d.id),
  };
}

/** Merge client payload; preserve row order; ensure required ids exist. */
export function mergeTaskStatusDefinitionsFromPayload(
  payload: ProjectTaskStatusDefinition[]
): ProjectTaskStatusDefinition[] {
  const fromClient = payload
    .map((row) => parseDefinitionRow(row))
    .filter((x): x is ProjectTaskStatusDefinition => x !== null);

  const seen = new Set<string>();
  const ordered: ProjectTaskStatusDefinition[] = [];
  for (const d of fromClient) {
    if (seen.has(d.id)) {
      continue;
    }
    seen.add(d.id);
    ordered.push(mergeDefinitionWithBuiltin(d));
  }
  return appendMissingRequiredStatuses(ordered, seen);
}

export function serializeTaskStatusDefinitionsForStorage(
  definitions: ProjectTaskStatusDefinition[]
): string {
  return JSON.stringify(definitions);
}
