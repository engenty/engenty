import { useTranslation } from "@engenty/i18n/ui";
import {
  AdminListCardsView,
  AdminListPagination,
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
import { usePageConfig, useWorkspaceContext } from "@engenty/ui-plugin-sdk";
import { FileText, Plus, Trash2 } from "lucide-react";
import { parseAsStringEnum, useQueryState } from "nuqs";
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { OfferListItem, OfferStatus } from "../api.js";
import { CreateOfferDialog } from "../components/create-offer-dialog.js";
import { OffersCards } from "../components/offers-cards.js";
import {
  type OffersColumnVisibility,
  type OffersSortColumn,
  OffersTableToolbar,
} from "../components/offers-display-dialog.js";
import { OffersTable } from "../components/offers-table.js";
import { useOffersListAgentUiSlice } from "../hooks/use-offers-agent-ui-slice.js";
import { formatContactSnapshot } from "../lib/contact-snapshot.js";
import { buildOfferCreatePayload } from "../lib/create-offer-payload.js";
import { getOffersToolbarLabels } from "../lib/offers-toolbar-labels.js";
import { getContactsPluginApi } from "../plugins.js";
import {
  useCreateOfferMutation,
  useDeleteOfferMutation,
  useNextOfferNumberQuery,
  useOfferCreateDialogContactsQuery,
  useOfferSettingsPageQuery,
  useOffersListQuery,
} from "../queries.js";

const OFFERS_DISPLAY_DEFAULTS = {
  viewMode: "table" as const,
  tableSize: "normal" as const,
  sortBy: "created_at" as OffersSortColumn,
  sortOrder: "desc" as const,
  columnVisibility: {
    title: true,
    offerNumber: true,
    status: true,
    offerDate: true,
    validUntil: true,
  } satisfies OffersColumnVisibility,
  columnOrder: [
    "title",
    "offerNumber",
    "status",
    "offerDate",
    "validUntil",
  ] as (keyof OffersColumnVisibility)[],
};

export function OffersListPage() {
  const { t } = useTranslation("offers");
  const navigate = useNavigate();
  useWorkspaceContext();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useQueryState(
    "status",
    parseAsStringEnum<OfferStatus>(["draft", "ready", "accepted"])
  );
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [creatingOffer, setCreatingOffer] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const contactsPlugin = getContactsPluginApi();

  const display = useListDisplayState<
    keyof OffersColumnVisibility,
    OffersSortColumn
  >({
    storageKey: "offers",
    defaults: OFFERS_DISPLAY_DEFAULTS,
    validSortColumns: [
      "title",
      "offer_number",
      "status",
      "offer_date",
      "valid_until",
      "created_at",
    ],
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

  const fullListParams = useMemo(
    () => ({
      page,
      pageSize,
      search: search.trim() || undefined,
      sortBy,
      sortOrder,
      status: status ?? undefined,
    }),
    [page, pageSize, search, sortBy, sortOrder, status]
  );

  const {
    data: listData,
    isLoading: loading,
    error: listError,
    refetch: refetchList,
  } = useOffersListQuery(fullListParams);

  const offers = listData?.data ?? [];
  const total = listData?.total ?? 0;
  const error = listError
    ? listError instanceof Error
      ? listError.message
      : t("loadFailed")
    : null;

  const settingsPageQuery = useOfferSettingsPageQuery(createDialogOpen);
  const nextNumberQuery = useNextOfferNumberQuery(createDialogOpen);
  const contactsQuery = useOfferCreateDialogContactsQuery(
    contactsPlugin,
    createDialogOpen
  );

  const createMutation = useCreateOfferMutation(fullListParams);
  const deleteMutation = useDeleteOfferMutation(fullListParams);

  const entities = useMemo(
    () =>
      (contactsQuery.data ?? []).map((e) => ({
        id: e.id,
        display_name: e.display_name,
      })),
    [contactsQuery.data]
  );
  const nextOfferNumber = nextNumberQuery.data ?? null;
  const nextOfferNumberLoading = nextNumberQuery.isLoading;
  const entitiesLoading = contactsQuery.isLoading;

  const selection = useTableSelection({ items: offers });
  const { selectedIds, handleSelectAll, handleSelectOne, clearSelection } =
    selection;

  const getOfferRoute = useCallback(
    (offer: OfferListItem) =>
      offer.status === "draft"
        ? `/mdl/offers/${offer.id}/draft`
        : `/mdl/offers/${offer.id}`,
    []
  );

  const breadcrumbs = useMemo(() => [{ label: t("menu.offers") }], [t]);

  const handleCreateOffer = useCallback(
    async (input: { title: string; clientId: string | null }) => {
      const settingsData = settingsPageQuery.data;
      const nextNum = nextNumberQuery.data;
      if (!settingsData || nextNum == null) {
        return;
      }
      setCreatingOffer(true);
      try {
        const { settings, templates, commercialSettings } = settingsData;

        let recipient_name: string | null = null;
        let recipient_address: string | null = null;
        let recipient_email: string | null = null;

        if (input.clientId && contactsPlugin) {
          try {
            const selectedContact = await contactsPlugin.getContact(
              input.clientId
            );
            const snapshot = formatContactSnapshot(selectedContact);
            recipient_name = snapshot.recipient_name || null;
            recipient_address = snapshot.recipient_address || null;
            recipient_email = snapshot.recipient_email || null;
          } catch {
            // Keep empty recipient fields if snapshot lookup fails.
          }
        }

        const created = await createMutation.mutateAsync(
          buildOfferCreatePayload({
            clientId: input.clientId,
            commercialSettings,
            offerNumber: nextNum,
            recipient: {
              recipient_name,
              recipient_address,
              recipient_email,
            },
            settings,
            templates,
            title: input.title,
          })
        );
        setCreateDialogOpen(false);
        navigate(`/mdl/offers/${created.id}/draft`);
      } catch (err) {
        setCreateError(
          err instanceof Error ? err.message : t("createOfferFailed")
        );
      } finally {
        setCreatingOffer(false);
      }
    },
    [
      contactsPlugin,
      createMutation,
      navigate,
      nextNumberQuery.data,
      settingsPageQuery.data,
    ]
  );

  const pageActions = useMemo(
    () => (
      <Button onClick={() => setCreateDialogOpen(true)} size="sm">
        <Plus className="mr-1.5 h-4 w-4" />
        {t("createOffer")}
      </Button>
    ),
    [t]
  );
  usePageConfig({
    actions: pageActions,
    breadcrumbs,
    topbarChrome: "contentBlend",
  });
  useOffersListAgentUiSlice({ search, offers });

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const handleSearchChange = useCallback((value: string) => {
    setPage(1);
    setSearch(value);
  }, []);

  const handleSortByChange = useCallback(
    (value: OffersSortColumn) => {
      setPage(1);
      display.setSortBy(value);
    },
    [display.setSortBy]
  );

  const handleSortOrderChange = useCallback(
    (value: "asc" | "desc") => {
      setPage(1);
      setSortOrder(value);
    },
    [setSortOrder]
  );

  const handleSortChange = useCallback(
    (column: OffersSortColumn) => {
      setPage(1);
      if (sortBy === column) {
        setSortOrder(sortOrder === "asc" ? "desc" : "asc");
      } else {
        setSortBy(column);
      }
    },
    [sortBy, sortOrder, setSortBy, setSortOrder]
  );

  const handleStatusChange = useCallback(
    (value: OfferStatus | null) => {
      setPage(1);
      setStatus(value);
    },
    [setStatus]
  );

  const handleBulkDelete = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      return;
    }
    setBulkDeleting(true);
    try {
      await Promise.all(ids.map((id) => deleteMutation.mutateAsync(id)));
      clearSelection();
      await refetchList();
    } finally {
      setBulkDeleting(false);
    }
  }, [selectedIds, clearSelection, deleteMutation, refetchList]);

  const bulkActions = selectedIds.size > 0 && (
    <Button
      className="h-8 gap-1.5"
      disabled={bulkDeleting}
      onClick={() => handleBulkDelete()}
      size="sm"
      variant="destructive"
    >
      <Trash2 className="h-3.5 w-3.5" />
      {t("deleteSelected", { count: selectedIds.size })}
    </Button>
  );

  return (
    <section className="flex h-full min-h-0 flex-col gap-3 overflow-hidden p-page">
      <div className="shrink-0">
        <OffersTableToolbar
          bulkActions={bulkActions}
          clearSelectionLabel={t("clearSelection")}
          columnOrder={columnOrder}
          columnVisibility={columnVisibility}
          labels={getOffersToolbarLabels(t, total)}
          onClearSelection={clearSelection}
          onSearchChange={handleSearchChange}
          onSortByChange={handleSortByChange}
          onSortOrderChange={handleSortOrderChange}
          onStatusFilterChange={handleStatusChange}
          searchQuery={search}
          selectedCount={selectedIds.size}
          setColumnOrder={display.setColumnOrder}
          setColumnVisibility={display.setColumnVisibility}
          setTableSize={display.setTableSize}
          setViewMode={display.setViewMode}
          sortBy={sortBy}
          sortOrder={sortOrder}
          statusFilter={status ?? null}
          tableSize={tableSize}
          viewMode={viewMode}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {loading && (
          <div className="overflow-hidden rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
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
                {Array.from({ length: 8 }, (_, i) => `skeleton-${i}`).map(
                  (rowKey) => (
                    <TableRow key={rowKey}>
                      {columnOrder
                        .filter((k) => columnVisibility[k])
                        .map((key) => (
                          <TableCell key={key}>
                            <Skeleton
                              className={
                                key === "title" ? "h-4 w-32" : "h-5 w-24"
                              }
                            />
                          </TableCell>
                        ))}
                    </TableRow>
                  )
                )}
              </TableBody>
            </Table>
          </div>
        )}
        {!loading && error && (
          <p className="text-destructive text-sm">{error}</p>
        )}

        {!(loading || error) && offers.length > 0 && viewMode === "table" && (
          <AdminListTableView
            pagination={{
              nextLabel: t("next"),
              onNext: () => setPage((value) => Math.min(totalPages, value + 1)),
              onPrevious: () => setPage((value) => Math.max(1, value - 1)),
              page,
              pageOfLabel: t("pageOf", { page, totalPages }),
              previousLabel: t("previous"),
              totalPages,
            }}
          >
            <OffersTable
              columnOrder={columnOrder}
              columnVisibility={columnVisibility}
              getOfferRoute={getOfferRoute}
              offers={offers}
              onDataChange={() => refetchList()}
              onRowClick={(offer) => navigate(getOfferRoute(offer))}
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

        {!(loading || error) && offers.length > 0 && viewMode === "cards" && (
          <AdminListCardsView>
            <OffersCards
              offers={offers}
              onCardClick={(offer) => navigate(getOfferRoute(offer))}
              tableSize={tableSize}
            />
          </AdminListCardsView>
        )}

        {!(loading || error) && offers.length === 0 && (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileText />
              </EmptyMedia>
              <EmptyTitle>
                {search.trim() ? t("noSearchResults") : t("noOffers")}
              </EmptyTitle>
              <EmptyDescription>
                {search.trim()
                  ? t("noSearchResultsDescription")
                  : t("noOffersDescription")}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              {search.trim() ? (
                <Button
                  onClick={() => handleSearchChange("")}
                  variant="outline"
                >
                  {t("clearSearch")}
                </Button>
              ) : (
                <Button onClick={() => setCreateDialogOpen(true)}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  {t("createOffer")}
                </Button>
              )}
            </EmptyContent>
          </Empty>
        )}

        {!(loading || error) &&
          (offers.length === 0 || viewMode === "cards") && (
            <AdminListPagination
              nextLabel={t("next")}
              onNext={() => setPage((value) => Math.min(totalPages, value + 1))}
              onPrevious={() => setPage((value) => Math.max(1, value - 1))}
              page={page}
              pageOfLabel={t("pageOf", { page, totalPages })}
              previousLabel={t("previous")}
              totalPages={totalPages}
            />
          )}
      </div>

      <CreateOfferDialog
        createError={createError}
        createReady={
          !(
            createDialogOpen &&
            (settingsPageQuery.isLoading || nextNumberQuery.isLoading)
          )
        }
        creating={creatingOffer}
        entities={entities}
        entitiesAvailable={Boolean(contactsPlugin)}
        entitiesLoading={entitiesLoading}
        nextOfferNumber={nextOfferNumber}
        nextOfferNumberLoading={nextOfferNumberLoading}
        onCreate={handleCreateOffer}
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
