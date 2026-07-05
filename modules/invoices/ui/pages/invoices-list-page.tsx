import { useTranslation } from "@engenty/i18n/ui";
import {
  AdminListCardsView,
  AdminListTableView,
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useListDisplayState,
  useTableSelection,
} from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { Plus } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { InvoiceListItem } from "../api.js";
import { CreateInvoiceDialog } from "../components/create-invoice-dialog.js";
import { InvoicesCards } from "../components/invoices-cards.js";
import {
  type InvoicesColumnVisibility,
  type InvoicesSortColumn,
  InvoicesTableToolbar,
} from "../components/invoices-display-dialog.js";
import { InvoicesTable } from "../components/invoices-table.js";
import {
  InvoiceDataSourceProvider,
  useInvoiceDataSource,
} from "../data-source-context.js";
import { useInvoicesModuleSecondaryShellNav } from "../hooks/use-invoices-module-secondary-shell-nav.js";
import {
  applyInvoicesListFilter,
  parseInvoicesListFilter,
} from "../lib/invoices-filters.js";
import { getInvoicesToolbarLabels } from "../lib/invoices-toolbar-labels.js";
import { getContactsPluginApi } from "../plugins.js";
import {
  useCreateInvoiceMutation,
  useInvoiceModalContactsQuery,
  useInvoiceSettingsQuery,
  useInvoicesListQuery,
  useNextInvoiceNumberQuery,
} from "../queries.js";

const INVOICES_DISPLAY_DEFAULTS = {
  viewMode: "table" as const,
  tableSize: "normal" as const,
  sortBy: "date" as InvoicesSortColumn,
  sortOrder: "desc" as const,
  columnVisibility: {
    number: true,
    date: true,
    dueDate: true,
    recipient: true,
    sumBrutto: true,
    content: true,
  } satisfies InvoicesColumnVisibility,
  columnOrder: [
    "number",
    "date",
    "dueDate",
    "recipient",
    "sumBrutto",
    "content",
  ] as (keyof InvoicesColumnVisibility)[],
};

function sortInvoices(
  invoices: InvoiceListItem[],
  sortBy: InvoicesSortColumn,
  sortOrder: "asc" | "desc"
): InvoiceListItem[] {
  const sorted = [...invoices].sort((a, b) => {
    let cmp = 0;
    switch (sortBy) {
      case "number":
        cmp = a.number.localeCompare(b.number);
        break;
      case "date":
        cmp = a.date.localeCompare(b.date);
        break;
      case "dueDate":
        cmp = a.dueDate.localeCompare(b.dueDate);
        break;
      case "sumBrutto":
        cmp = a.sumBrutto - b.sumBrutto;
        break;
      case "createdAt":
        cmp = a.createdAt.localeCompare(b.createdAt);
        break;
      default:
        break;
    }
    return sortOrder === "asc" ? cmp : -cmp;
  });
  return sorted;
}

function filterInvoices(
  invoices: InvoiceListItem[],
  search: string
): InvoiceListItem[] {
  if (!search.trim()) {
    return invoices;
  }
  const q = search.trim().toLowerCase();
  return invoices.filter(
    (inv) =>
      inv.number.toLowerCase().includes(q) ||
      inv.content?.toLowerCase().includes(q) ||
      inv.recipientSnapshot?.displayName?.toLowerCase().includes(q) ||
      inv.recipientSnapshot?.email?.toLowerCase().includes(q)
  );
}

function filterInvoicesByClientId(
  invoices: InvoiceListItem[],
  clientId: string | null
): InvoiceListItem[] {
  if (!clientId) {
    return invoices;
  }
  return invoices.filter((inv) => inv.clientId === clientId);
}

export function InvoicesListPage() {
  return (
    <InvoiceDataSourceProvider>
      <InvoicesListPageContent />
    </InvoiceDataSourceProvider>
  );
}

function InvoicesListPageContent() {
  const { t } = useTranslation("invoices");
  const [searchParams, setSearchParams] = useSearchParams();
  const clientIdFilter = useMemo(
    () => searchParams.get("clientId")?.trim() || null,
    [searchParams]
  );
  const clearClientFilter = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("clientId");
        return next;
      },
      { replace: true }
    );
  }, [setSearchParams]);
  const navigate = useNavigate();
  const statusFilter = useMemo(
    () => parseInvoicesListFilter(searchParams.get("filter")),
    [searchParams]
  );
  const dataSource = useInvoiceDataSource();
  const listQuery = useInvoicesListQuery();
  const invoices = useMemo(() => listQuery.data ?? [], [listQuery.data]);
  const isLoading = listQuery.isLoading;
  const listError =
    listQuery.error == null
      ? null
      : listQuery.error instanceof Error
        ? listQuery.error.message
        : t("loadFailed");
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const error = listError ?? downloadError;
  const search = searchParams.get("q") ?? "";
  const setSearchValue = useCallback(
    (value: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value) {
            next.set("q", value);
          } else {
            next.delete("q");
          }
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );
  const openInvoice = useCallback(
    (inv: InvoiceListItem) => {
      navigate(
        inv.status === "draft"
          ? `/mdl/invoices/${inv.id}/draft`
          : `/mdl/invoices/${inv.id}`
      );
    },
    [navigate]
  );
  const openDetail = useCallback(
    (inv: InvoiceListItem) => navigate(`/mdl/invoices/${inv.id}`),
    [navigate]
  );

  const display = useListDisplayState<
    keyof InvoicesColumnVisibility,
    InvoicesSortColumn
  >({
    storageKey: "invoices",
    defaults: INVOICES_DISPLAY_DEFAULTS,
    validSortColumns: ["number", "date", "dueDate", "sumBrutto", "createdAt"],
  });

  const {
    sortBy,
    sortOrder,
    viewMode,
    tableSize,
    columnVisibility,
    columnOrder,
    setSortBy,
    setSortOrder,
  } = display;

  const clientFilteredInvoices = useMemo(
    () =>
      applyInvoicesListFilter(
        filterInvoicesByClientId(invoices, clientIdFilter),
        statusFilter
      ),
    [invoices, clientIdFilter, statusFilter]
  );

  const filteredInvoices = useMemo(
    () =>
      sortInvoices(
        filterInvoices(clientFilteredInvoices, search),
        sortBy,
        sortOrder
      ),
    [clientFilteredInvoices, search, sortBy, sortOrder]
  );

  const selection = useTableSelection<InvoiceListItem>({
    items: filteredInvoices,
  });
  const { selectedIds, handleSelectAll, handleSelectOne, clearSelection } =
    selection;

  const handleSortChange = useCallback(
    (column: InvoicesSortColumn) => {
      if (sortBy === column) {
        setSortOrder(sortOrder === "asc" ? "desc" : "asc");
      } else {
        setSortBy(column);
      }
    },
    [sortBy, sortOrder, setSortBy, setSortOrder]
  );

  const handleDownloadPdf = useCallback(
    async (inv: InvoiceListItem) => {
      try {
        await dataSource.downloadInvoicePdf(inv.id, `${inv.number}.pdf`);
      } catch (err) {
        setDownloadError(err instanceof Error ? err.message : t("loadFailed"));
      }
    },
    [dataSource, t]
  );

  const currency = useMemo(
    () =>
      new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR" }),
    []
  );

  // --- Create invoice flow --------------------------------------------------
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const contactsPlugin = useMemo(() => getContactsPluginApi(), []);
  const settingsQuery = useInvoiceSettingsQuery(createDialogOpen);
  const nextNumberQuery = useNextInvoiceNumberQuery(createDialogOpen);
  const contactsQuery = useInvoiceModalContactsQuery(
    createDialogOpen ? contactsPlugin : null
  );
  const createMutation = useCreateInvoiceMutation();
  const createEntities = useMemo(
    () => contactsQuery.data ?? [],
    [contactsQuery.data]
  );

  const handleCreateInvoice = useCallback(
    async (input: { title: string; clientId: string | null }) => {
      const settings = settingsQuery.data;
      const nextNum = nextNumberQuery.data;
      if (!settings || nextNum == null) {
        return;
      }
      setCreatingInvoice(true);
      try {
        const issueDate = new Date();
        const due = new Date(issueDate);
        due.setDate(due.getDate() + (settings.due_in_days ?? 14));
        const created = await createMutation.mutateAsync({
          number: nextNum,
          date: issueDate.toISOString().slice(0, 10),
          dueDate: due.toISOString().slice(0, 10),
          sumNetto: 0,
          tax: 0,
          sumBrutto: 0,
          clientId: input.clientId ?? undefined,
          status: "draft",
          currency: "EUR",
          title: input.title || null,
          introduction: settings.default_intro || null,
          finalNotes: settings.default_final_notes || null,
        });
        setCreateDialogOpen(false);
        navigate(`/mdl/invoices/${created.id}/draft`);
      } catch (err) {
        setCreateError(
          err instanceof Error ? err.message : t("createInvoiceFailed")
        );
      } finally {
        setCreatingInvoice(false);
      }
    },
    [createMutation, navigate, nextNumberQuery.data, settingsQuery.data, t]
  );

  const pageActions = useMemo(
    () => (
      <Button onClick={() => setCreateDialogOpen(true)} size="sm">
        <Plus className="mr-1.5 h-4 w-4" />
        {t("createInvoice")}
      </Button>
    ),
    [t]
  );

  const { moduleRootCrumb, secondaryNavAfterItems, secondaryNavHeaderSlot } =
    useInvoicesModuleSecondaryShellNav();
  const breadcrumbs = useMemo(
    () => (moduleRootCrumb ? [moduleRootCrumb] : []),
    [moduleRootCrumb]
  );
  usePageConfig({
    actions: pageActions,
    breadcrumbs,
    contentStackBackground: "paper",
    secondaryNavAfterItems,
    secondaryNavHeaderSlot,
    topbarChrome: "contentBlend",
  });

  return (
    <section className="flex h-full min-h-0 flex-col gap-3 overflow-hidden p-page">
      {clientIdFilter ? (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <span className="text-muted-foreground">
            {t("filterByClientBanner")}
          </span>
          <Button onClick={clearClientFilter} size="sm" variant="outline">
            {t("clearClientFilter")}
          </Button>
        </div>
      ) : null}
      <div className="shrink-0">
        <InvoicesTableToolbar
          clearSelectionLabel={t("clearSelection", { defaultValue: "Clear" })}
          columnOrder={columnOrder}
          columnVisibility={columnVisibility}
          labels={getInvoicesToolbarLabels(t, filteredInvoices.length)}
          onClearSelection={clearSelection}
          onSearchChange={setSearchValue}
          onSortByChange={display.setSortBy}
          onSortOrderChange={display.setSortOrder}
          searchQuery={search}
          selectedCount={selectedIds.size}
          setColumnOrder={display.setColumnOrder}
          setColumnVisibility={display.setColumnVisibility}
          setTableSize={display.setTableSize}
          setViewMode={display.setViewMode}
          sortBy={sortBy}
          sortOrder={sortOrder}
          tableSize={tableSize}
          totalCount={filteredInvoices.length}
          viewMode={viewMode}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {isLoading && (
          <div className="overflow-hidden rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  {columnOrder
                    .filter((k) => columnVisibility[k])
                    .map((key) => (
                      <TableHead key={key}>
                        <Skeleton className="h-4 w-20" />
                      </TableHead>
                    ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: 6 }, (_, i) => `skeleton-${i}`).map(
                  (rowKey) => (
                    <TableRow key={rowKey}>
                      <TableCell className="w-10">
                        <Skeleton className="h-4 w-4" />
                      </TableCell>
                      {columnOrder
                        .filter((k) => columnVisibility[k])
                        .map((key) => (
                          <TableCell key={key}>
                            <Skeleton className="h-4 w-24" />
                          </TableCell>
                        ))}
                    </TableRow>
                  )
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {!isLoading && error && (
          <div className="rounded-md border border-red-300/40 bg-red-100/10 p-3 text-red-700 text-sm dark:text-red-300">
            {t("loadFailedWithError", { error })}
          </div>
        )}

        {!(isLoading || error) && filteredInvoices.length === 0 && (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon" />
              <EmptyTitle>
                {clientIdFilter && clientFilteredInvoices.length === 0
                  ? t("noInvoicesForClient")
                  : search
                    ? t("noSearchResults", {
                        defaultValue: "No invoices match",
                      })
                    : t("noInvoices")}
              </EmptyTitle>
              <EmptyDescription>
                {clientIdFilter && clientFilteredInvoices.length === 0
                  ? t("listDescription")
                  : search
                    ? t("noSearchResultsDescription", {
                        defaultValue: "Try a different search.",
                      })
                    : t("listDescription")}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <div className="flex flex-wrap gap-2">
                {clientIdFilter && clientFilteredInvoices.length === 0 ? (
                  <Button onClick={clearClientFilter} variant="outline">
                    {t("clearClientFilter")}
                  </Button>
                ) : null}
                {search ? (
                  <Button onClick={() => setSearchValue("")} variant="outline">
                    {t("clearSearch", { defaultValue: "Clear search" })}
                  </Button>
                ) : null}
                {search || clientIdFilter ? null : (
                  <Button onClick={() => setCreateDialogOpen(true)}>
                    <Plus className="mr-1.5 h-4 w-4" />
                    {t("createInvoice")}
                  </Button>
                )}
              </div>
            </EmptyContent>
          </Empty>
        )}

        {!(isLoading || error) &&
          filteredInvoices.length > 0 &&
          viewMode === "table" && (
            <AdminListTableView>
              <InvoicesTable
                columnOrder={columnOrder}
                columnVisibility={columnVisibility}
                formatCurrency={currency.format}
                invoices={filteredInvoices}
                onDownloadPdf={handleDownloadPdf}
                onEdit={openInvoice}
                onRowClick={openDetail}
                onSelectAll={handleSelectAll}
                onSelectOne={handleSelectOne}
                onSortChange={handleSortChange}
                selectedIds={selectedIds}
                sortBy={sortBy}
                sortOrder={sortOrder}
                tableSize={tableSize}
              />
            </AdminListTableView>
          )}

        {!(isLoading || error) &&
          filteredInvoices.length > 0 &&
          viewMode === "cards" && (
            <AdminListCardsView>
              <InvoicesCards
                formatCurrency={currency.format}
                invoices={filteredInvoices}
                onCardClick={openDetail}
                onDownloadPdf={handleDownloadPdf}
                onEdit={openInvoice}
                tableSize={tableSize}
              />
            </AdminListCardsView>
          )}
      </div>

      <CreateInvoiceDialog
        createError={createError}
        createReady={
          !(
            createDialogOpen &&
            (settingsQuery.isLoading || nextNumberQuery.isLoading)
          )
        }
        creating={creatingInvoice}
        entities={createEntities}
        entitiesAvailable={Boolean(contactsPlugin)}
        entitiesLoading={contactsQuery.isLoading}
        nextInvoiceNumber={nextNumberQuery.data ?? null}
        nextInvoiceNumberLoading={nextNumberQuery.isLoading}
        onCreate={handleCreateInvoice}
        onOpenChange={(open) => {
          setCreateDialogOpen(open);
          if (!open) {
            setCreateError(null);
          }
        }}
        open={createDialogOpen}
      />
    </section>
  );
}
