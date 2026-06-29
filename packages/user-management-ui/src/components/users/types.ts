import type { UserRecord } from "../../lib/schemas.js";

export type UserColumnVisibility = Record<string, boolean>;

export {
  createDefaultUserColumnOrder,
  createDefaultUserColumnVisibility,
} from "./columns.js";

export interface UserFilters {
  roleFilter: "all" | "admin" | "member";
  searchQuery: string;
}

export function applyUserFilters(
  users: UserRecord[],
  filters: UserFilters
): UserRecord[] {
  return users.filter((user) => {
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      const matches =
        user.display_name?.toLowerCase().includes(query) ||
        user.email?.toLowerCase().includes(query);
      if (!matches) {
        return false;
      }
    }
    if (filters.roleFilter !== "all" && user.role !== filters.roleFilter) {
      return false;
    }
    return true;
  });
}
