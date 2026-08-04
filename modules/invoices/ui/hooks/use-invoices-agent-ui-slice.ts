import {
  buildAgentUiPageBrief,
  useRegisterAgentUiSlice,
} from "@engenty/app-shell";
import { useMemo } from "react";
import type { InvoiceListItem } from "../api.js";

function invoiceLabel(invoice: InvoiceListItem): string {
  const number = invoice.number?.trim();
  const title = invoice.title?.trim();
  if (number && title) {
    return `${number} — ${title}`;
  }
  return title || number || "Invoice";
}

export function useInvoicesEditAgentUiSlice(invoice: InvoiceListItem | null) {
  const slice = useMemo(() => {
    if (!invoice) {
      return null;
    }
    const title = invoiceLabel(invoice);
    return {
      selection: { entity_id: invoice.id, entity_type: "invoice" },
      page: {
        ...buildAgentUiPageBrief({
          page_type: "edit",
          page_title: title,
          page_description: `Editing invoice ${title} (status ${invoice.status}).`,
        }),
        invoice_id: invoice.id,
        invoice_status: invoice.status,
        invoice_number: invoice.number,
        invoice_title: invoice.title,
      },
    };
  }, [invoice]);

  useRegisterAgentUiSlice("invoices.edit", slice);
}

export function useInvoicesDetailAgentUiSlice(invoice: InvoiceListItem | null) {
  const slice = useMemo(() => {
    if (!invoice) {
      return null;
    }
    const title = invoiceLabel(invoice);
    return {
      selection: { entity_id: invoice.id, entity_type: "invoice" },
      page: {
        ...buildAgentUiPageBrief({
          page_type: "detail",
          page_title: title,
          page_description: `Viewing invoice ${title} (status ${invoice.status}).`,
        }),
        invoice_id: invoice.id,
        invoice_status: invoice.status,
        invoice_number: invoice.number,
        invoice_title: invoice.title,
      },
    };
  }, [invoice]);

  useRegisterAgentUiSlice("invoices.detail", slice);
}

export function useInvoicesListAgentUiSlice(input: {
  search: string;
  invoices: InvoiceListItem[];
}) {
  const slice = useMemo(() => {
    const q = input.search.trim();
    const preview = input.invoices.slice(0, 10).map((inv) => ({
      id: inv.id,
      label: invoiceLabel(inv),
      title: inv.title,
      status: inv.status,
      invoice_number: inv.number,
    }));
    return {
      page: {
        ...buildAgentUiPageBrief({
          page_type: "list",
          page_title: "Invoices",
          page_description: q
            ? `Invoices list filtered by search (${input.invoices.length} visible).`
            : `Invoices list (${input.invoices.length} visible).`,
          list_search: q,
          list_total: input.invoices.length,
          list_preview: preview,
        }),
        ...(preview.length > 0 ? { invoices_preview: preview } : {}),
      },
    };
  }, [input.search, input.invoices]);

  useRegisterAgentUiSlice("invoices.list", slice);
}

export function useInvoicesSettingsAgentUiSlice() {
  const slice = useMemo(
    () => ({
      page: {
        ...buildAgentUiPageBrief({
          page_type: "settings",
          page_title: "Invoices settings",
          page_description:
            "Invoices module settings (numbering, defaults, templates).",
        }),
      },
    }),
    []
  );

  useRegisterAgentUiSlice("invoices.settings", slice);
}
