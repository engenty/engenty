import { getDefaultLocale } from "@/config/localization";
import type { InvoiceBlock } from "@/dal/invoiceBlocks";
import type { InvoiceWithClient } from "@/dal/invoices";
import type {
  PartyMeta,
  TemplateDataConfig,
  TemplateDataGroup,
  TemplateDataTotals,
} from "@/features/offer/offerToTemplateData/types";
import {
  createFormatter,
  formatDate,
  formatOptionalDate,
} from "../engine/transform/formatters";
import { buildCommercialTemplateData } from "../engine/transform/toTemplateData";

interface ClientData {
  address_city?: string | null;
  address_country?: string | null;
  address_street?: string | null;
  address_zip?: string | null;
  company_name: string;
  email?: string | null;
  id: string;
  legal_name?: string | null;
  vat_id?: string | null;
}

interface CompanySettings {
  address_city?: string;
  address_country?: string;
  address_street?: string;
  address_zip?: string;
  bank_account_name?: string;
  bank_bic?: string;
  bank_iban?: string;
  bank_name?: string;
  company_name?: string;
  currency?: string;
  email?: string;
  logo_url?: string;
  number_locale?: string;
  phone?: string;
  tax_number?: string;
  vat_id?: string;
  website?: string;
}

export interface InvoiceTemplateData {
  buyer: PartyMeta;
  config: TemplateDataConfig;
  content: TemplateDataGroup[];
  invoice: {
    id: string;
    invoice_number: string;
    issue_date: string;
    due_date: string | null;
    service_period_from: string | null;
    service_period_until: string | null;
    delivery_date: string | null;
    title: string;
    introduction: string | null;
    final_notes: string | null;
    currency: string;
    profile_id: string | null;
    buyer_reference: string | null;
    payment_terms: string | null;
    payment_means: InvoiceWithClient["payment_means"] | null;
    seller_endpoint: InvoiceWithClient["seller_endpoint"] | null;
    buyer_endpoint: InvoiceWithClient["buyer_endpoint"] | null;
    billing_type: string | null;
    billing_interval: string | null;
    retainer_amount: number | null;
    spillover_rules: string | null;
    allows_fixed_positions: boolean | null;
    usage_based: boolean | null;
  };
  seller: PartyMeta;
  totals: TemplateDataTotals;
}

export function buildInvoiceTemplateData(
  invoice: InvoiceWithClient,
  blocks: InvoiceBlock[],
  client: ClientData | null,
  companySettings: CompanySettings
): InvoiceTemplateData {
  const currency = companySettings.currency || "EUR";
  const locale = getDefaultLocale(companySettings);
  const formatter = createFormatter(locale, currency);
  const settings = (invoice.settings || {}) as Record<string, unknown>;

  const engineResult = buildCommercialTemplateData({
    blocks: blocks as any,
    settings: settings as any,
    currency,
    locale,
    timeframe_from: invoice.service_period_from,
    timeframe_until: invoice.service_period_until,
    phases_enabled: true,
  });

  const totals: TemplateDataTotals = {
    subtotal: engineResult.totals.subtotal,
    taxAmount: engineResult.totals.taxAmount,
    total: engineResult.totals.total,
    currency,
    subtotal_formatted: formatter.format(engineResult.totals.subtotal),
    taxAmount_formatted: formatter.format(engineResult.totals.taxAmount),
    total_formatted: formatter.format(engineResult.totals.total),
    taxes: engineResult.totals.taxes,
    show_taxes: engineResult.totals.show_taxes,
    phase_totals: engineResult.totals.phase_totals,
    show_phase_totals: engineResult.totals.show_phase_totals,
  };

  const buyer: PartyMeta = {
    name: client?.company_name || "",
    address: {
      street: client?.address_street || null,
      zip: client?.address_zip || null,
      city: client?.address_city || null,
      country: client?.address_country || null,
    },
    vat_id: client?.vat_id || null,
    contact: {
      name: client?.legal_name || null,
      email: client?.email || null,
    },
    electronic_address: invoice.buyer_endpoint as {
      id: string;
      scheme: string;
    } | null,
  };

  const seller: PartyMeta = {
    name: companySettings.company_name || "",
    address: {
      street: companySettings.address_street || null,
      zip: companySettings.address_zip || null,
      city: companySettings.address_city || null,
      country: companySettings.address_country || null,
    },
    vat_id: companySettings.vat_id || null,
    tax_id: companySettings.tax_number || null,
    contact: {
      email: companySettings.email || null,
      phone: companySettings.phone || null,
    },
    electronic_address: invoice.seller_endpoint as {
      id: string;
      scheme: string;
    } | null,
  };

  const config: TemplateDataConfig = {
    phase_numbering_format: "none",
    show_phase_subtotals: false,
    show_tax_per_item:
      (settings.show_tax_per_item as boolean | undefined) ?? true,
    show_phase_totals:
      (settings.show_phase_totals as boolean | undefined) ?? false,
  };

  return {
    invoice: {
      id: invoice.id,
      invoice_number:
        invoice.invoice_number || invoice.id?.slice(0, 8).toUpperCase(),
      issue_date: formatDate(invoice.issue_date || invoice.created_at),
      due_date: formatOptionalDate(invoice.due_date),
      service_period_from: formatOptionalDate(invoice.service_period_from),
      service_period_until: formatOptionalDate(invoice.service_period_until),
      delivery_date: formatOptionalDate(invoice.delivery_date),
      title: invoice.title,
      introduction: invoice.introduction || null,
      final_notes: invoice.final_notes || null,
      currency,
      profile_id: invoice.profile_id || null,
      buyer_reference: invoice.buyer_reference || null,
      payment_terms: invoice.payment_terms || null,
      payment_means: invoice.payment_means || null,
      seller_endpoint: invoice.seller_endpoint || null,
      buyer_endpoint: invoice.buyer_endpoint || null,
      billing_type: invoice.billing_type || null,
      billing_interval: invoice.billing_interval || null,
      retainer_amount: invoice.retainer_amount || null,
      spillover_rules: invoice.spillover_rules || null,
      allows_fixed_positions: invoice.allows_fixed_positions ?? null,
      usage_based: invoice.usage_based ?? null,
    },
    buyer,
    seller,
    content: engineResult.content as any,
    totals,
    config,
  };
}
