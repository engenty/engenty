import type { ComponentType, ReactNode } from "react";
import type { UserRecord } from "./lib/schemas.js";

export interface UserManagementListCellContext {
  enrichments: Record<string, unknown>;
  isAdmin: boolean;
  isCurrentUser: boolean;
  navigate: (to: string) => void;
  user: UserRecord;
}

export interface UserManagementListColumn {
  defaultVisible?: boolean;
  icon?: ComponentType<{ className?: string }>;
  key: string;
  label: string;
  order?: number;
  renderCell: (context: UserManagementListCellContext) => ReactNode;
}

export interface UserManagementListEnricher {
  enrich: (users: UserRecord[]) => Promise<Record<string, unknown>>;
  id: string;
}

export interface UserManagementListHooksApi {
  registerListColumn: (column: UserManagementListColumn) => void;
  registerListEnricher: (enricher: UserManagementListEnricher) => void;
}

const listColumns = new Map<string, UserManagementListColumn>();
const listEnrichers = new Map<string, UserManagementListEnricher>();

export function resetUserManagementListHooks() {
  listColumns.clear();
  listEnrichers.clear();
}

export function registerUserManagementListColumn(
  column: UserManagementListColumn
) {
  listColumns.set(column.key, column);
}

export function registerUserManagementListEnricher(
  enricher: UserManagementListEnricher
) {
  listEnrichers.set(enricher.id, enricher);
}

export function getUserManagementListColumns(): UserManagementListColumn[] {
  return Array.from(listColumns.values()).sort(
    (left, right) => (left.order ?? 0) - (right.order ?? 0)
  );
}

export function getUserManagementListEnrichers(): UserManagementListEnricher[] {
  return Array.from(listEnrichers.values());
}
