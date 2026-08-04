import {
  buildAgentUiPageBrief,
  useRegisterAgentUiSlice,
} from "@engenty/app-shell";
import { useMemo } from "react";
import type { OfferListItem } from "../api.js";

function offerLabel(offer: OfferListItem): string {
  const number = offer.offer_number?.trim();
  const title = offer.title?.trim();
  if (number && title) {
    return `${number} — ${title}`;
  }
  return title || number || "Offer";
}

export function useOffersEditAgentUiSlice(offer: OfferListItem | null) {
  const slice = useMemo(() => {
    if (!offer) {
      return null;
    }
    const title = offerLabel(offer);
    return {
      selection: { entity_id: offer.id, entity_type: "offer" },
      page: {
        ...buildAgentUiPageBrief({
          page_type: "edit",
          page_title: title,
          page_description: `Editing offer ${title} (status ${offer.status}).`,
        }),
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
    const title = offerLabel(offer);
    return {
      selection: { entity_id: offer.id, entity_type: "offer" },
      page: {
        ...buildAgentUiPageBrief({
          page_type: "detail",
          page_title: title,
          page_description: `Viewing offer ${title} (status ${offer.status}).`,
        }),
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
      label: offerLabel(o),
      title: o.title,
      status: o.status,
      offer_number: o.offer_number,
    }));
    return {
      page: {
        ...buildAgentUiPageBrief({
          page_type: "list",
          page_title: "Offers",
          page_description: q
            ? `Offers list filtered by search (${input.offers.length} visible).`
            : `Offers list (${input.offers.length} visible).`,
          list_search: q,
          list_total: input.offers.length,
          list_preview: preview,
        }),
        ...(preview.length > 0 ? { offers_preview: preview } : {}),
      },
    };
  }, [input.search, input.offers]);

  useRegisterAgentUiSlice("offers.list", slice);
}

export function useOffersSettingsAgentUiSlice() {
  const slice = useMemo(
    () => ({
      page: {
        ...buildAgentUiPageBrief({
          page_type: "settings",
          page_title: "Offers settings",
          page_description:
            "Offers module settings (numbering, defaults, templates).",
        }),
      },
    }),
    []
  );

  useRegisterAgentUiSlice("offers.settings", slice);
}
