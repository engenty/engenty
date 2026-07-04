import { useRegisterAgentUiSlice } from "@engenty/app-shell";
import { useMemo } from "react";
import type { OfferListItem } from "../api.js";

export function useOffersEditAgentUiSlice(offer: OfferListItem | null) {
  const slice = useMemo(() => {
    if (!offer) {
      return null;
    }
    return {
      selection: { entity_id: offer.id, entity_type: "offer" },
      page: {
        offer_id: offer.id,
        offer_status: offer.status,
        offer_number: offer.offer_number,
        offer_title: offer.title,
      },
    };
  }, [offer]);

  useRegisterAgentUiSlice("offers.edit", slice);
}

export function useOffersDetailAgentUiSlice(offer: OfferListItem | null) {
  const slice = useMemo(() => {
    if (!offer) {
      return null;
    }
    return {
      selection: { entity_id: offer.id, entity_type: "offer" },
      page: {
        offer_id: offer.id,
        offer_status: offer.status,
        offer_number: offer.offer_number,
        offer_title: offer.title,
      },
    };
  }, [offer]);

  useRegisterAgentUiSlice("offers.detail", slice);
}

export function useOffersListAgentUiSlice(input: {
  search: string;
  offers: OfferListItem[];
}) {
  const slice = useMemo(() => {
    const q = input.search.trim();
    const preview = input.offers.slice(0, 10).map((o) => ({
      id: o.id,
      title: o.title,
      status: o.status,
      offer_number: o.offer_number,
    }));
    return {
      page: {
        ...(q ? { list_search: q } : {}),
        ...(preview.length > 0 ? { offers_preview: preview } : {}),
      },
    };
  }, [input.search, input.offers]);

  useRegisterAgentUiSlice("offers.list", slice);
}
