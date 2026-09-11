import type { OffersQueryParams } from "./api.js";

export const offerKeys = {
  all: ["offers"] as const,
  createDialogContacts: () => ["offers", "create-dialog-contacts"] as const,
  detail: (id: string) => ["offers", "detail", id] as const,
  detailContacts: () => ["offers", "detail-contacts"] as const,
  detailPage: (id: string) => ["offers", "detail-page", id] as const,
  editContacts: () => ["offers", "edit-contacts"] as const,
  editPage: (id: string) => ["offers", "edit-page", id] as const,
  list: (params: OffersQueryParams) => ["offers", "list", params] as const,
  nextNumber: () => ["offers", "next-number"] as const,
  settingsPage: () => ["offers", "settings-page"] as const,
  templates: () => ["offers", "templates"] as const,
  versions: (id: string) => ["offers", "versions", id] as const,
};
