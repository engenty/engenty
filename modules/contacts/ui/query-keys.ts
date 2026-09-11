import type { ContactsQueryParams } from "./api/contacts.js";

/** Primitive tuple so filtered list keys change reliably. */
export function contactsListQueryKeyParts(params: ContactsQueryParams) {
  return [
    params.page ?? 1,
    params.pageSize ?? 25,
    params.role ?? null,
    params.type ?? null,
    params.search ?? null,
    params.sortBy ?? null,
    params.sortOrder ?? null,
  ] as const;
}

export const contactKeys = {
  all: ["contacts"] as const,
  detail: (id: string) => ["contacts", "detail", id] as const,
  list: (params: ContactsQueryParams) =>
    ["contacts", "list", ...contactsListQueryKeyParts(params)] as const,
  relations: (id: string, includeInactive = false) =>
    ["contacts", "relations", id, includeInactive] as const,
  roleMenu: () => ["contacts", "role-menu"] as const,
  settings: () => ["contacts", "settings"] as const,
  settingsPage: () => ["contacts", "settings-page"] as const,
};
