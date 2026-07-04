import type { ModuleLiveBinding } from "@engenty/live-cache";
import { invoiceKeys } from "./queries.js";

/**
 * Live cache: any write to invoices/invoice_blocks (copilot, OpenAPI, other
 * tabs, background jobs) invalidates the whole invoices query tree.
 */
export const invoicesLiveBinding: ModuleLiveBinding = {
  id: "invoices",
  queryRoot: invoiceKeys.all,
  postgresChanges: [
    { schema: "module_invoices", table: "invoices" },
    { schema: "module_invoices", table: "invoice_blocks" },
  ],
};
