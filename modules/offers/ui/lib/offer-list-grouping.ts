import type { OfferListItem, OfferStatus } from "../api.js";
import type { OffersSidebarPrefs } from "./use-offers-sidebar-prefs.js";

export interface OffersListGroup {
  key: string;
  label: string;
  offers: OfferListItem[];
}

const STATUS_ORDER: OfferStatus[] = ["draft", "ready", "accepted"];

export function buildOffersListGroups(
  offers: OfferListItem[],
  groupBy: OffersSidebarPrefs["groupBy"],
  ungroupedLabel: string,
  clientNameById: Map<string, string>,
  statusLabel: (status: OfferStatus) => string
): OffersListGroup[] {
  if (groupBy === "none") {
    return [{ key: "__all__", label: "", offers }];
  }

  const map = new Map<string, OfferListItem[]>();
  const resolveKey = (offer: OfferListItem): string => {
    if (groupBy === "status") {
      return statusLabel(offer.status);
    }
    if (!offer.client_id) {
      return ungroupedLabel;
    }
    return clientNameById.get(offer.client_id)?.trim() || ungroupedLabel;
  };

  for (const offer of offers) {
    const key = resolveKey(offer);
    const bucket = map.get(key) ?? [];
    bucket.push(offer);
    map.set(key, bucket);
  }

  // Status groups keep the workflow order (draft → ready → accepted).
  const statusOrder = STATUS_ORDER.map((status) => statusLabel(status));

  return [...map.entries()]
    .sort(([left], [right]) => {
      if (groupBy === "status") {
        const leftIdx = statusOrder.indexOf(left);
        const rightIdx = statusOrder.indexOf(right);
        if (leftIdx !== -1 && rightIdx !== -1) {
          return leftIdx - rightIdx;
        }
      }
      return left.localeCompare(right);
    })
    .map(([key, groupOffers]) => ({ key, label: key, offers: groupOffers }));
}
