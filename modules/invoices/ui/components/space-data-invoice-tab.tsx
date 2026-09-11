/**
 * The invoice's own page, contributed to the space Data pane.
 *
 * A binding, not a second viewer: the pane shows what `/mdl/invoices/:id`
 * shows, minus the document header the host's tree already stands in for. The
 * page picks the draft editor or the read-only document from the invoice's
 * phase, so the pane never offers editing on a record the law froze.
 *
 * `recordId` — never the path — is what identifies the record.
 */
import type { UiTabRenderProps } from "@engenty/ui-plugin-sdk";
import { InvoiceDetailPage } from "../pages/invoice-detail-page.js";

export function SpaceDataInvoiceTab({ params }: UiTabRenderProps) {
  const recordId = typeof params.recordId === "string" ? params.recordId : "";
  if (!recordId) {
    return null;
  }
  return <InvoiceDetailPage embedded invoiceId={recordId} />;
}
