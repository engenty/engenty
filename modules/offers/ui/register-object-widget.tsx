"use client";

import { registerObjectWidget } from "@engenty/ai-ui";
import {
  OfferObjectCard,
  OfferObjectPanel,
} from "./components/copilot/offer-object-card.js";

const OFFER_DETAIL_PATTERN =
  /^\/mdl\/offers\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

let registered = false;

export function registerOffersObjectWidget() {
  if (registered) {
    return;
  }
  registered = true;

  registerObjectWidget({
    id: "offers.offer",
    module: "offers",
    entity: "offer",
    card: OfferObjectCard,
    panel: OfferObjectPanel,
    getHref: (ref) => `/mdl/offers/${ref.id}`,
    matchHref: (pathname) => {
      const match = pathname.match(OFFER_DETAIL_PATTERN);
      return match ? { module: "offers", entity: "offer", id: match[1] } : null;
    },
  });
}
