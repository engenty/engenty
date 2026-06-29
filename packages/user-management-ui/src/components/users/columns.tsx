import { Mail, Shield } from "lucide-react";
import type { ComponentType } from "react";
import {
  getUserManagementListColumns,
  type UserManagementListColumn,
} from "../../list-hooks.js";

export interface UserTableColumnConfig {
  defaultVisible?: boolean;
  icon?: ComponentType<{ className?: string }>;
  key: string;
  label: string;
  labelKey?: string;
  order: number;
  renderCell?: UserManagementListColumn["renderCell"];
}

const baseColumns: UserTableColumnConfig[] = [
  {
    key: "contact",
    labelKey: "usersTable.contact",
    label: "Contact",
    icon: Mail,
    order: 50,
    defaultVisible: true,
  },
  {
    key: "accessLevel",
    labelKey: "usersTable.accessLevel",
    label: "Access level",
    icon: Shield,
    order: 60,
    defaultVisible: true,
  },
];

export function getUserTableColumns(): UserTableColumnConfig[] {
  const registeredColumns = getUserManagementListColumns().map((column) => ({
    key: column.key,
    label: column.label,
    icon: column.icon,
    order: column.order ?? 100,
    defaultVisible: column.defaultVisible ?? true,
    renderCell: column.renderCell,
  }));

  return [...baseColumns, ...registeredColumns].sort(
    (left, right) => left.order - right.order
  );
}

export function createDefaultUserColumnVisibility(): Record<string, boolean> {
  return Object.fromEntries(
    getUserTableColumns().map((column) => [
      column.key,
      column.defaultVisible ?? true,
    ])
  );
}

export function createDefaultUserColumnOrder(): string[] {
  return getUserTableColumns().map((column) => column.key);
}
