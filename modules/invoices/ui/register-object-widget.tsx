"use client";

import { registerObjectWidget } from "@engenty/ai-ui";
import { InvoiceObjectCard } from "./components/copilot/invoice-object-card.js";

const INVOICE_DETAIL_PATTERN =
  /^\/mdl\/invoices\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

let registered = false;

export function registerInvoicesObjectWidget() {
  if (registered) {
    return;
  }
  registered = true;

  registerObjectWidget({
    id: "invoices.invoice",
    module: "invoices",
    entity: "invoice",
    card: InvoiceObjectCard,
    getHref: (ref) => `/mdl/invoices/${ref.id}`,
    matchHref: (pathname) => {
      const match = pathname.match(INVOICE_DETAIL_PATTERN);
      return match
        ? { module: "invoices", entity: "invoice", id: match[1] }
        : null;
    },
  });
}
