import { useMemo } from "react";
import {
  type ContactsRoleMenuItem,
  FIXED_CONTACT_ROLES,
} from "../api/role-menu-settings.js";
import { useContactsRoleMenuQuery } from "../queries.js";

const defaultItems: ContactsRoleMenuItem[] = FIXED_CONTACT_ROLES.map(
  (role, index) => ({
    slug: role,
    visible: true,
    order: index,
  })
);

export function useContactsRoleOptions() {
  const query = useContactsRoleMenuQuery();
  const items = query.data?.items ?? defaultItems;
  return useMemo(() => [...items].sort((a, b) => a.order - b.order), [items]);
}
