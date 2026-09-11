import { describe, expect, it } from "vitest";
import type { OfferListItem } from "./api.js";
import {
  offerMatchesList,
  optimisticOffer,
} from "./complex-optimistic-mutations.js";
import { patchOffer, patchOfferPage } from "./optimistic-mutations.js";

describe("offer optimistic cache reducers", () => {
  it("patches detail and composite page caches immutably", () => {
    const offer = {
      id: "offer-1",
      status: "draft",
      title: "Before",
    } as OfferListItem;

    const detail = patchOffer(offer, { title: "After" });
    const page = patchOfferPage({ blocks: [], offer }, { title: "After" });

    expect(detail?.title).toBe("After");
    expect(page?.offer.title).toBe("After");
    expect(page?.blocks).toEqual([]);
    expect(offer.title).toBe("Before");
  });

  it("does not synthesize uncached offer data", () => {
    expect(patchOffer(undefined, { title: "After" })).toBeUndefined();
    expect(patchOfferPage(undefined, { title: "After" })).toBeUndefined();
  });

  it("creates a temporary offer for immediate list rendering", () => {
    const offer = optimisticOffer(
      { offer_number: "DRAFT", title: "Immediate" } as never,
      "opt_offer"
    );
    expect(offer.id).toBe("opt_offer");
    expect(offer.title).toBe("Immediate");
    expect(offer.version_number).toBe(1);
  });

  it("keeps temporary offers out of mismatched list filters", () => {
    const offer = optimisticOffer(
      {
        client_id: "client-1",
        offer_number: "DRAFT",
        status: "draft",
        title: "Immediate",
      } as never,
      "opt_offer"
    );

    expect(offerMatchesList(offer, { search: "immediate" })).toBe(true);
    expect(offerMatchesList(offer, { client_id: "client-2" })).toBe(false);
    expect(offerMatchesList(offer, { status: "accepted" })).toBe(false);
  });
});
