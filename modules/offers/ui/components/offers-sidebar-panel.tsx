import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import {
  cn,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  sidebarColumnContentInsetClassName,
} from "@engenty/ui-core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { deleteOffer, type OfferStatus } from "../api.js";
import { buildOffersListGroups } from "../lib/offer-list-grouping.js";
import { useOffersSidebarPrefs } from "../lib/use-offers-sidebar-prefs.js";
import { getContactsPluginApi } from "../plugins.js";
import { useOffersListQuery } from "../queries.js";
import { OffersSidebarFooter } from "./offers-sidebar-footer.js";
import { OffersSidebarHeader } from "./offers-sidebar-header.js";
import {
  OfferSidebarRow,
  OffersSidebarDeleteDialog,
  OffersSidebarEntitySkeleton,
  OffersSidebarGroupedList,
} from "./offers-sidebar-list.js";

const SIDEBAR_FETCH_SIZE = 200;

export function OffersSidebarPanel() {
  const { t, i18n } = useTranslation("offers");
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const trimmed = search.trim();
  const isSearching = trimmed.length > 0;
  const { prefs, updatePrefs } = useOffersSidebarPrefs();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    void i18n.loadNamespaces(["offers"]);
  }, [i18n]);

  const contactsPlugin = useMemo(() => {
    try {
      return getContactsPluginApi();
    } catch {
      return null;
    }
  }, []);
  const contactsQuery = useQuery({
    queryKey: ["offers", "sidebar-filter-contacts"],
    queryFn: ({ signal }) =>
      contactsPlugin?.getContacts({ pageSize: 100 }, signal) ??
      Promise.resolve([]),
    enabled: !!contactsPlugin,
  });
  const clients = useMemo(
    () =>
      (contactsQuery.data ?? []).map((entity) => ({
        id: entity.id,
        display_name: entity.display_name,
      })),
    [contactsQuery.data]
  );
  const clientNameById = useMemo(
    () => new Map(clients.map((c) => [c.id, c.display_name])),
    [clients]
  );

  const statusLabel = useCallback(
    (status: OfferStatus) =>
      t(`statusLabels.${status}`, {
        defaultValue:
          status === "draft"
            ? "Draft"
            : status === "ready"
              ? "Ready"
              : "Accepted",
      }),
    [t]
  );

  const offersQuery = useOffersListQuery({
    page: 1,
    pageSize: SIDEBAR_FETCH_SIZE,
    search: trimmed || undefined,
    sortBy: prefs.sortBy,
    sortOrder: prefs.sortOrder,
    status: prefs.status === "all" ? undefined : prefs.status,
    client_id: prefs.clientId === "all" ? undefined : prefs.clientId,
  });

  const offers = offersQuery.data?.data ?? [];
  const isLoading = offersQuery.isLoading && !offersQuery.data;

  const groupedOffers = useMemo(
    () =>
      buildOffersListGroups(
        offers,
        prefs.groupBy,
        t("sidebar.ungrouped", { defaultValue: "No customer" }),
        clientNameById,
        statusLabel
      ),
    [offers, prefs.groupBy, clientNameById, statusLabel, t]
  );

  const match = pathname.match(/^\/(?:module|mdl)\/offers\/([a-f0-9-]+)/i);
  const activeOfferId = match ? match[1] : null;

  const handleDeleteOffer = useCallback(
    async (id: string) => {
      try {
        await deleteOffer(id);
        void offersQuery.refetch();
        if (activeOfferId === id) {
          navigate("/mdl/offers");
        }
      } catch {
        // query error surfaced by the list/API layer
      } finally {
        setDeletingId(null);
      }
    },
    [activeOfferId, offersQuery, navigate]
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <OffersSidebarHeader
        clients={clients}
        isSearching={isSearching}
        onClearSearch={() => setSearch("")}
        onCreateOffer={() => navigate("/mdl/offers?create=1")}
        onSearchChange={setSearch}
        pathname={pathname}
        prefs={prefs}
        search={search}
        statusLabel={statusLabel}
        trimmed={trimmed}
        updatePrefs={updatePrefs}
      />

      <SidebarContent className="min-h-0 flex-1 gap-0.5 overflow-x-hidden px-0 py-0">
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-2">
          <SidebarGroup className="min-h-0 flex-1 p-0">
            <SidebarGroupContent>
              {isLoading ? (
                <OffersSidebarEntitySkeleton />
              ) : offers.length === 0 ? (
                <p
                  className={cn(
                    "py-2 text-muted-foreground text-xs",
                    sidebarColumnContentInsetClassName
                  )}
                >
                  {isSearching
                    ? t("sidebar.noSearchResults", {
                        defaultValue: "No offers match your search",
                      })
                    : t("sidebar.noOffers", {
                        defaultValue: "No offers yet",
                      })}
                </p>
              ) : (
                <OffersSidebarGroupedList
                  emptyLabel={t("sidebar.noOffers", {
                    defaultValue: "No offers yet",
                  })}
                  groups={groupedOffers}
                  renderItem={(offer) => (
                    <OfferSidebarRow
                      active={activeOfferId === offer.id}
                      key={offer.id}
                      offer={offer}
                      onDelete={setDeletingId}
                    />
                  )}
                />
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        </div>
      </SidebarContent>

      <OffersSidebarFooter pathname={pathname} />

      <OffersSidebarDeleteDialog
        deletingId={deletingId}
        onClose={() => setDeletingId(null)}
        onConfirm={handleDeleteOffer}
      />
    </div>
  );
}
