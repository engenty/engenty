/**
 * The offer's own page, contributed to the space Data pane.
 *
 * A binding, not a second viewer: the pane shows what `/mdl/offers/:id` shows,
 * minus the DocumentHeader the host's tree already stands in for.
 *
 * `recordId` — never the path — is what identifies the record: the node's name
 * carries the id precisely so resolving one costs no scan.
 */
import type { UiTabRenderProps } from "@engenty/ui-plugin-sdk";
import { OfferDetailPage } from "../pages/offer-detail-page.js";

export function SpaceDataOfferTab({ params }: UiTabRenderProps) {
  const recordId = typeof params.recordId === "string" ? params.recordId : "";
  if (!recordId) {
    return null;
  }
  return <OfferDetailPage embedded offerId={recordId} />;
}
