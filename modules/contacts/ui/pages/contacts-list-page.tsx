import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  useListDisplayState,
  useTableSelection,
} from "@engenty/ui-core";
import { useFeatureFlags, usePageConfig } from "@engenty/ui-plugin-sdk";
import { Building2, ChevronDown, Plus, Upload, User } from "lucide-react";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { ContactType } from "../../src/schema/index.js";
import { AddOrganisationDialog } from "../components/add-organisation-dialog.js";
import { AddPersonDialog } from "../components/add-person-dialog.js";
import { BulkEditRolesModal } from "../components/bulk-edit-roles-modal.js";
import { ContactsBulkDeleteDialog } from "../components/contacts-bulk-delete-dialog.js";
import type { ContactsSortColumn } from "../components/contacts-display-dialog.js";
import { ContactsExportMenu } from "../components/contacts-export-menu.js";
import { ContactsListFilterBar } from "../components/contacts-list-filter-bar.js";
import { ContactsListMain } from "../components/contacts-list-main.js";
import { ContactsListToolbar } from "../components/contacts-list-toolbar.js";
import { ContactsOverflowMenu } from "../components/contacts-overflow-menu.js";
import { useContactsListAgentUiSlice } from "../hooks/use-contacts-agent-ui-slice.js";
import {
  parseContactsListRoleFromSearchParam,
  useContactsListData,
} from "../hooks/use-contacts-list-data.js";
import { useContactsModuleSecondaryShellNav } from "../hooks/use-contacts-module-secondary-shell-nav.js";
import { CONTACTS_LIST_DISPLAY_DEFAULTS } from "../lib/contacts-list-display.js";
import {
  useContactsRoleMenuQuery,
  useDeleteContactMutation,
} from "../queries.js";
import { buildContactsListToolbarLabels } from "./contacts-list-toolbar-labels.js";

const contactsModulePageListShellSectionClassName =
  "flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-page";

export function ContactsListPage() {
  const { t, i18n } = useTranslation("contacts");
  const contactsNamespaceReady = i18n.hasLoadedNamespace("contacts");
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [contactKind, setContactKind] = useQueryState(
    "contact_kind",
    parseAsStringLiteral(["organisation", "person"] as const)
  );
  const [addOrganisationOpen, setAddOrganisationOpen] = useState(false);
  const [addPersonOpen, setAddPersonOpen] = useState(false);
  const [bulkEditRolesOpen, setBulkEditRolesOpen] = useState(false);
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [mdUp, setMdUp] = useState(false);
  const roleMenuQuery = useContactsRoleMenuQuery();
  const roleMenuItems = roleMenuQuery.data?.items ?? [];
  const { resolved } = useFeatureFlags();
  const organisationEnabled =
    resolved?.["contacts.organisation_accounts"] !== false;
  const personEnabled = resolved?.["contacts.personal_accounts"] !== false;
  const allowedContactTypes = useMemo((): ContactType[] => {
    const types: ContactType[] = [];
    if (organisationEnabled) {
      types.push("organisation");
    }
    if (personEnabled) {
      types.push("person");
    }
    return types;
  }, [organisationEnabled, personEnabled]);

  const display = useListDisplayState<
    keyof ContactsColumnVisibility,
    ContactsSortColumn
  >({
    storageKey: "contacts",
    defaults: CONTACTS_LIST_DISPLAY_DEFAULTS,
    validSortColumns: [
      "display_name",
      "legal_name",
      "contact_name",
      "email",
      "phone",
      "location",
      "created_at",
    ],
  });

  const {
    sortBy,
    sortOrder,
    viewMode,
    tableSize,
    pageSize,
    columnVisibility,
    columnOrder,
    setSortBy,
    setSortOrder,
  } = display;

  const roleFilterFromUrl = parseContactsListRoleFromSearchParam(
    searchParams.get("role")
  );

  const typeFilterFromUrl = useMemo((): ContactType | "" => {
    const fromNuqs =
      contactKind === "organisation" || contactKind === "person"
        ? contactKind
        : "";
    const legacy = searchParams.get("type");
    const fromLegacy =
      legacy === "organisation" || legacy === "person" ? legacy : "";
    const raw = fromNuqs || fromLegacy;
    if (raw === "organisation" && !organisationEnabled) {
      return "";
    }
    if (raw === "person" && !personEnabled) {
      return "";
    }
    return raw;
  }, [contactKind, organisationEnabled, personEnabled, searchParams]);

  const {
    entities,
    isLoading,
    error,
    total,
    roleFilter,
    typeFilter,
    loadEntities,
    setSearch,
    setPage,
    search,
    page,
  } = useContactsListData(
    {
      pageSize,
      sortBy,
      sortOrder,
      roleFilter: roleFilterFromUrl,
      typeFilter: typeFilterFromUrl,
    },
    t
  );

  useContactsListAgentUiSlice({
    entities,
    roleFilter,
    search,
    total,
    typeFilter,
  });

  useEffect(() => {
    if (contactKind === "organisation" && !organisationEnabled) {
      void setContactKind(null);
    }
    if (contactKind === "person" && !personEnabled) {
      void setContactKind(null);
    }
  }, [contactKind, organisationEnabled, personEnabled, setContactKind]);

  useLayoutEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setMdUp(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const legacy = searchParams.get("type");
    if (legacy !== "organisation" && legacy !== "person") {
      return;
    }
    if (searchParams.get("contact_kind")) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("type");
          return next;
        },
        { replace: true }
      );
      return;
    }
    void setContactKind(legacy);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("type");
        return next;
      },
      { replace: true }
    );
  }, [searchParams, setContactKind, setSearchParams]);

  const deleteContactMutation = useDeleteContactMutation({
    page,
    pageSize,
    role: roleFilter || undefined,
    type: typeFilter || undefined,
    search: search.trim() || undefined,
    sortBy,
    sortOrder,
  });

  const selection = useTableSelection({ items: entities });
  const { selectedIds, handleSelectAll, handleSelectOne, clearSelection } =
    selection;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const { moduleRootCrumb, secondaryNavAfterItems, secondaryNavHeaderSlot } =
    useContactsModuleSecondaryShellNav();

  const breadcrumbs = useMemo(
    () => (moduleRootCrumb ? [moduleRootCrumb] : []),
    [moduleRootCrumb]
  );
  const exportMenu = useMemo(
    () => (
      <ContactsExportMenu
        baseName={`contacts-${new Date().toISOString().slice(0, 10)}`}
        columnOrder={columnOrder}
        columnVisibility={columnVisibility}
        entities={entities}
        exportCsvLabel={t("exportCsv")}
        exportLabel={t("export")}
        exportPrintLabel={t("exportPrint")}
        exportXlsLabel={t("exportXls")}
      />
    ),
    [columnOrder, columnVisibility, entities, t, contactsNamespaceReady]
  );

  const overflowMenu = useMemo(
    () => (
      <ContactsOverflowMenu
        importLabel={t("import.label")}
        menuMoreLabel={t("menuMore")}
        settingsLabel={t("moduleSettings")}
      />
    ),
    [t, contactsNamespaceReady]
  );

  const pageActions = useMemo(
    () => (
      <div className="flex items-center gap-2">
        {exportMenu}
        {overflowMenu}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm">
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              {t("addEntity")}
              <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setAddOrganisationOpen(true)}>
              <Building2 className="mr-2 h-4 w-4" />
              {t("addOrganisation")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setAddPersonOpen(true)}>
              <User className="mr-2 h-4 w-4" />
              {t("addPerson")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/mdl/contacts/import")}>
              <Upload className="mr-2 h-4 w-4" />
              {t("import.label")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    ),
    [exportMenu, navigate, overflowMenu, t, contactsNamespaceReady]
  );

  usePageConfig({
    actions: pageActions,
    breadcrumbs,
    contentStackBackground: "paper",
    secondaryNavAfterItems,
    secondaryNavHeaderSlot,
    topbarChrome: "contentBlend",
  });

  const handleSearchChange = useCallback(
    (value: string) => {
      setPage(1);
      void setSearch(value === "" ? null : value);
    },
    [setPage, setSearch]
  );

  const handleSortByChange = useCallback(
    (value: ContactsSortColumn) => {
      setPage(1);
      display.setSortBy(value);
    },
    [setPage, display.setSortBy]
  );

  const handleRoleChange = useCallback(
    (role: string | "") => {
      setPage(1);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (role) {
          next.set("role", role);
        } else {
          next.delete("role");
        }
        return next;
      });
    },
    [setPage, setSearchParams]
  );

  const handleTypeChange = useCallback(
    (nextType: ContactType | "") => {
      setPage(1);
      void setContactKind(nextType === "" ? null : nextType);
    },
    [setPage, setContactKind]
  );

  const handleSortOrderChange = useCallback(
    (value: "asc" | "desc") => {
      setPage(1);
      setSortOrder(value);
    },
    [setPage, setSortOrder]
  );

  const handlePageSizeChange = useCallback(
    (value: typeof pageSize) => {
      setPage(1);
      display.setPageSize(value);
    },
    [display.setPageSize, setPage]
  );

  const handleSortChange = useCallback(
    (column: ContactsSortColumn) => {
      setPage(1);
      if (sortBy === column) {
        setSortOrder(sortOrder === "asc" ? "desc" : "asc");
      } else {
        setSortBy(column);
      }
    },
    [sortBy, sortOrder, setSortBy, setSortOrder, setPage]
  );

  const handleAddSuccess = useCallback(() => {
    void loadEntities();
  }, [loadEntities]);

  const selectedEntities = useMemo(
    () => entities.filter((e) => selectedIds.has(e.id)),
    [entities, selectedIds]
  );

  const handleBulkDelete = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      return;
    }
    setBulkDeleting(true);
    try {
      await Promise.all(ids.map((id) => deleteContactMutation.mutateAsync(id)));
      clearSelection();
      setBulkDeleteConfirmOpen(false);
      void loadEntities();
    } finally {
      setBulkDeleting(false);
    }
  }, [selectedIds, clearSelection, deleteContactMutation, loadEntities]);

  const handleBulkEditRolesSuccess = useCallback(() => {
    clearSelection();
    setBulkEditRolesOpen(false);
    void loadEntities();
  }, [clearSelection, loadEntities]);

  const toolbarLabels = useMemo(
    () =>
      buildContactsListToolbarLabels({
        t,
        roleMenuItems,
        selectedCount: selectedIds.size,
        total,
      }),
    [t, roleMenuItems, selectedIds.size, total]
  );

  return (
    <section
      className={contactsModulePageListShellSectionClassName}
      data-engenty-region="list"
    >
      <div className="shrink-0 space-y-2">
        <ContactsListToolbar
          allowedContactTypes={allowedContactTypes}
          bulkDeleting={bulkDeleting}
          display={display}
          labels={toolbarLabels}
          onDelete={() => setBulkDeleteConfirmOpen(true)}
          onEditRoles={() => setBulkEditRolesOpen(true)}
          onPageSizeChange={handlePageSizeChange}
          onSearchChange={handleSearchChange}
          onSortByChange={handleSortByChange}
          onSortOrderChange={handleSortOrderChange}
          onTypeChange={
            allowedContactTypes.length > 0 ? handleTypeChange : undefined
          }
          search={search}
          selection={selection}
          total={total}
          typeFilter={typeFilter}
        />
        {!mdUp && (
          <ContactsListFilterBar
            filterByRoleLabel={toolbarLabels.filterByRole}
            onRoleChange={handleRoleChange}
            roleAllLabel={toolbarLabels.roleAll}
            roleFilter={roleFilter}
            roleOptions={toolbarLabels.roleOptions}
          />
        )}
      </div>

      <ContactsListMain
        columnOrder={columnOrder}
        columnVisibility={columnVisibility}
        entities={entities}
        error={error}
        isLoading={isLoading}
        navigate={navigate}
        onSelectAll={handleSelectAll}
        onSelectOne={handleSelectOne}
        onSortChange={handleSortChange}
        page={page}
        selectedIds={selectedIds}
        setPage={setPage}
        sortBy={sortBy}
        sortOrder={sortOrder}
        t={t}
        tableSize={tableSize}
        totalPages={totalPages}
        viewMode={viewMode}
      />

      <AddOrganisationDialog
        onOpenChange={setAddOrganisationOpen}
        onSuccess={handleAddSuccess}
        open={addOrganisationOpen}
        t={t}
      />
      <AddPersonDialog
        onOpenChange={setAddPersonOpen}
        onSuccess={handleAddSuccess}
        open={addPersonOpen}
        t={t}
      />
      <BulkEditRolesModal
        entities={selectedEntities}
        onClose={() => setBulkEditRolesOpen(false)}
        onSuccess={handleBulkEditRolesSuccess}
        open={bulkEditRolesOpen}
        t={t}
      />
      <ContactsBulkDeleteDialog
        bulkDeleting={bulkDeleting}
        onConfirm={handleBulkDelete}
        onOpenChange={setBulkDeleteConfirmOpen}
        open={bulkDeleteConfirmOpen}
        selectedCount={selectedIds.size}
        t={t}
      />
    </section>
  );
}
