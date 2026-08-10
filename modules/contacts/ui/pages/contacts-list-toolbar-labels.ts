import type { ContactsRoleMenuItem } from "../api/role-menu-settings.js";
import { getRoleTitleLabel } from "../api/role-menu-settings.js";

/** Matches `labels` on [`ContactsListToolbar`](../components/contacts-list-toolbar.tsx). */
export interface ContactsListToolbarLabels {
  ascending: string;
  brandName: string;
  cardsView: string;
  clearSelection: string;
  compactView: string;
  contactName: string;
  createdAt: string;
  delete: string;
  descending: string;
  display: string;
  displayedColumns: string;
  displayName: string;
  editRoles: string;
  email: string;
  filterByRole: string;
  filterByType: string;
  hiddenInTable: string;
  hideAll: string;
  itemsPerPage: string;
  legalName: string;
  location: string;
  noColumnsDisplayed: string;
  paginationSummary: string;
  phone: string;
  roleAll: string;
  roleOptions: Array<{ value: string; label: string }>;
  roles: string;
  searchPlaceholder: string;
  selectedSummary: string;
  showAll: string;
  sortBy: string;
  sortByCreatedAt: string;
  sortByName: string;
  tableView: string;
  toolbarMore: string;
  typeOrganisation: string;
  typePerson: string;
  viewModeGroup: string;
}

type TranslateFn = (
  key: string,
  options?: Record<string, string | number> & { defaultValue?: string }
) => string;

export interface BuildContactsListToolbarLabelsArgs {
  roleMenuItems: ContactsRoleMenuItem[];
  selectedCount: number;
  t: TranslateFn;
  total: number;
}

export function buildContactsListToolbarLabels(
  args: BuildContactsListToolbarLabelsArgs
): ContactsListToolbarLabels {
  const { t, roleMenuItems, selectedCount, total } = args;
  return {
    filterByRole: t("filterByRole"),
    roleAll: t("roleAll"),
    selectedSummary: t("selectedSummary", {
      count: selectedCount,
      defaultValue: `${selectedCount} selected`,
    }),
    roleOptions: roleMenuItems
      .filter((item) => item.visible)
      .sort((a, b) => a.order - b.order)
      .map((item) => ({
        value: item.slug,
        label:
          item.plural?.trim() ||
          item.title?.trim() ||
          getRoleTitleLabel(item.slug, t),
      })),
    searchPlaceholder: t("searchPlaceholder"),
    display: t("display"),
    viewModeGroup: t("viewModeGroup"),
    itemsPerPage: t("itemsPerPage"),
    paginationSummary: t("paginationSummary", { total }),
    sortByName: t("sortByName"),
    sortByCreatedAt: t("sortByCreatedAt"),
    ascending: t("ascending"),
    descending: t("descending"),
    compactView: t("compactView"),
    tableView: t("tableView"),
    cardsView: t("cardsView"),
    sortBy: t("sortBy"),
    displayedColumns: t("displayedColumns"),
    hiddenInTable: t("hiddenInTable"),
    showAll: t("showAll"),
    hideAll: t("hideAll"),
    noColumnsDisplayed: t("noColumnsDisplayed"),
    brandName: t("brandName"),
    createdAt: t("createdAt", { defaultValue: "Created" }),
    displayName: t("displayName"),
    legalName: t("legalName"),
    contactName: t("contactName"),
    email: t("email"),
    phone: t("phone"),
    location: t("location"),
    roles: t("roles"),
    clearSelection: t("clearSelection"),
    editRoles: t("editRoles"),
    delete: t("delete"),
    filterByType: t("filterByType"),
    typeOrganisation: t("typeOrganisation"),
    typePerson: t("typePerson"),
    toolbarMore: t("toolbarMore", { defaultValue: "More" }),
  };
}
