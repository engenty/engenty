import type { ComponentType, ReactNode } from "react";
import type { Task } from "../src/schema/types.js";

export interface TasksListCellContext {
  enrichments: Record<string, unknown>;
  navigate: (to: string) => void;
  task: Task;
}

export interface TasksListColumn {
  defaultVisible?: boolean;
  icon?: ComponentType<{ className?: string }>;
  key: string;
  label: string;
  labelKey?: string;
  order?: number;
  renderCell: (context: TasksListCellContext) => ReactNode;
}

export interface TasksListEnricher {
  enrich: (tasks: Task[]) => Promise<Record<string, unknown>>;
  id: string;
}

export interface TasksListHooksApi {
  registerListColumn: (column: TasksListColumn) => void;
  registerListEnricher: (enricher: TasksListEnricher) => void;
}

const listColumns = new Map<string, TasksListColumn>();
const listEnrichers = new Map<string, TasksListEnricher>();

export function resetTasksListHooks() {
  listColumns.clear();
  listEnrichers.clear();
}

export function registerTasksListColumn(column: TasksListColumn) {
  listColumns.set(column.key, column);
}

export function registerTasksListEnricher(enricher: TasksListEnricher) {
  listEnrichers.set(enricher.id, enricher);
}

export function getTasksListRegisteredColumns(): TasksListColumn[] {
  return Array.from(listColumns.values()).sort(
    (left, right) => (left.order ?? 0) - (right.order ?? 0)
  );
}

export function getTasksListEnrichers(): TasksListEnricher[] {
  return Array.from(listEnrichers.values());
}
