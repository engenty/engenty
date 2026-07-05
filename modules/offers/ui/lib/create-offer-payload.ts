import type { OfferCreateInput, OfferSettings, OfferTemplate } from "../api.js";
import {
  normalizeCommercialTaxRates,
  resolveDefaultTaxRateFromCommercial,
} from "./commercial-tax-rates.js";

export interface OfferCommercialSettings {
  currency?: string | null;
  tax_rates?: unknown;
}

export interface BuildOfferCreatePayloadInput {
  /** Optional contact id to link as the offer client. */
  clientId: string | null;
  commercialSettings: OfferCommercialSettings | null;
  /** Seeds the introduction; falls back to the tenant default intro. */
  introduction?: string | null;
  /** Optional source lead for the handoff linkage. */
  leadId?: string | null;
  /** Injectable "now" for deterministic tests; defaults to current date. */
  now?: Date;
  /** Generated offer number (from `getNextOfferNumber`). */
  offerNumber: string;
  /** Resolved recipient snapshot fields (empty when no client). */
  recipient: {
    recipient_address: string | null;
    recipient_email: string | null;
    recipient_name: string | null;
  };
  settings: OfferSettings;
  templates: OfferTemplate[];
  title: string;
}

/**
 * Build the full default `OfferCreateInput`. Single source of truth shared by
 * the offers list create flow and the lead→offer handoff so the two never drift.
 */
export function buildOfferCreatePayload(
  input: BuildOfferCreatePayloadInput
): OfferCreateInput {
  const now = input.now ?? new Date();
  const tenantTaxRates = normalizeCommercialTaxRates(
    input.commercialSettings?.tax_rates
  );
  const defaultTaxRate = resolveDefaultTaxRateFromCommercial(tenantTaxRates);
  const currency = input.commercialSettings?.currency?.trim() || "EUR";
  const defaultTemplate =
    input.templates.find((template) => template.is_default) ??
    input.templates[0] ??
    null;
  const validUntilDate = new Date(now);
  validUntilDate.setDate(
    validUntilDate.getDate() + input.settings.valid_until_days
  );

  return {
    template_id: defaultTemplate?.id ?? null,
    client_id: input.clientId,
    lead_id: input.leadId ?? null,
    title: input.title,
    offer_number: input.offerNumber,
    status: "draft",
    reference: null,
    offer_date: now.toISOString().slice(0, 10),
    valid_until: validUntilDate.toISOString().slice(0, 10),
    introduction: input.introduction || input.settings.default_intro || null,
    final_notes: input.settings.default_final_notes || null,
    currency,
    recipient_name: input.recipient.recipient_name,
    recipient_address: input.recipient.recipient_address,
    recipient_email: input.recipient.recipient_email,
    recipient_custom_info: null,
    show_contact_name: true,
    show_contact_email: true,
    billing_type: "fixed_price",
    billing_interval: null,
    retainer_amount: null,
    spillover_rules: null,
    allows_fixed_positions: false,
    usage_based: false,
    default_tax_rate: defaultTaxRate,
    show_tax_per_item: false,
    no_tax_reason: null,
    phases_enabled: true,
    show_phase_index: true,
    phase_index_pattern: "1.",
    show_phase_totals: false,
    metadata_json: {},
    settings_json: {},
    created_by: null,
  };
}
