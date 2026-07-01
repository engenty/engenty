import type {
  ContactsColumnVisibility,
  ContactsSortColumn,
} from "../components/contacts-display-dialog.js";

/** Defaults for contacts list display prefs (`useListDisplayState`). */
export const CONTACTS_LIST_DISPLAY_DEFAULTS = {
  viewMode: "table" as const,
  tableSize: "normal" as const,
  pageSize: 25 as const,
  sortBy: "legal_name" as ContactsSortColumn,
  sortOrder: "asc" as const,
  columnVisibility: {
    legalName: true,
    roles: true,
    email: true,
    location: true,
    createdAt: true,
    displayName: false,
    contactName: false,
    phone: false,
  } satisfies ContactsColumnVisibility,
  columnOrder: [
    "legalName",
    "roles",
    "email",
    "location",
    "createdAt",
    "displayName",
    "contactName",
    "phone",
  ] as (keyof ContactsColumnVisibility)[],
};
