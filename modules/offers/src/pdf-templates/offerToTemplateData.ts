/**
 * Offer to TemplateData transformation.
 * Produces hierarchical content (phases, sections, bundles) for the PDF template.
 */

import type { OfferListItem } from "../../ui/api.js";
import type { OfferBlock } from "../schema/types.js";

export type LineItemSubtype = "position" | "headline" | "text" | "page_break";

export interface TemplateDataOffer {
  created_at: string;
  final_notes: string | null;
  id: string;
  introduction: string | null;
  offer_number: string;
  reference: string | null;
  timeframe_from: string | null;
  timeframe_until: string | null;
  title: string;
  valid_until: string;
}

export interface TemplateDataRecipient {
  address_city: string | null;
  address_country: string | null;
  address_full: string;
  address_street: string | null;
  address_zip: string | null;
  company_name: string;
  contact_name: string | null;
  custom_info: string | null;
  email: string | null;
  show_contact_email: boolean;
  show_contact_name: boolean;
}

export interface TemplateDataSender {
  address_city: string | null;
  address_country: string | null;
  address_full: string;
  address_street: string | null;
  address_zip: string | null;
  bank_account_name: string | null;
  bank_name: string | null;
  bic: string | null;
  company_name: string;
  company_registration_number: string | null;
  email: string | null;
  iban: string | null;
  logo_url: string | null;
  phone: string | null;
  tax_number: string | null;
  vat_id: string | null;
  website: string | null;
}

export interface TemplateDataPhase {
  billing_type?: string | null;
  content: string | null;
  timeframe_from?: string | null;
  timeframe_until?: string | null;
  title: string | null;
}

export interface TemplateDataContentBlock {
  content: string | null;
  type: "text";
}

export interface TemplateDataItem {
  amount: number;
  block_position: string;
  content: string | null;
  cost_per_item: number;
  cost_per_item_formatted: string;
  entry_position: string;
  line_item_subtype?: LineItemSubtype;
  position: string;
  tax: number;
  tax_formatted: string;
  title: string;
  total: number;
  total_formatted: string;
  unit: string;
  unit_display?: string;
}

export interface TemplateDataBundle {
  content: string | null;
  items: TemplateDataItem[];
  position: string;
  subtotal: number;
  subtotal_formatted: string;
  title: string | null;
}

export type TemplateDataLineItemsEntry =
  | { type: "item"; item: TemplateDataItem }
  | { type: "bundle"; bundle: TemplateDataBundle };

export interface TemplateDataBlock {
  content: string | null;
  entries: TemplateDataLineItemsEntry[];
  position: string;
  subtotal: number;
  subtotal_formatted: string;
  title: string | null;
  type: "line_items";
}

export interface TemplateDataSection {
  blocks: TemplateDataBlock[];
  content: TemplateDataContentBlock[];
  index: number;
  subtotal: number;
  subtotal_formatted: string;
  title: string | null;
}

export interface TemplateDataGroup {
  phase: TemplateDataPhase | null;
  sections: TemplateDataSection[];
  subtotal: number;
  subtotal_formatted: string;
  type: "general" | "phase";
}

export interface TemplateDataTotals {
  currency: string;
  no_tax_reason?: string | null;
  phase_totals: {
    title: string | null;
    label: string;
    subtotal: number;
    subtotal_formatted: string;
  }[];
  show_phase_totals: boolean;
  show_taxes: boolean;
  subtotal: number;
  subtotal_formatted: string;
  taxAmount: number;
  taxAmount_formatted: string;
  taxes: {
    rate: number;
    amount: number;
    rate_formatted: string;
    amount_formatted: string;
  }[];
  total: number;
  total_formatted: string;
}

export interface TemplateDataConfig {
  phase_numbering_format: string;
  show_phase_subtotals: boolean;
  show_phase_totals: boolean;
  show_tax_per_item: boolean;
}

export interface OfferTemplateData {
  config: TemplateDataConfig;
  content: TemplateDataGroup[];
  offer: TemplateDataOffer;
  recipient: TemplateDataRecipient;
  sender: TemplateDataSender;
  settings?: Record<string, unknown>;
  theme?: Record<string, unknown>;
  totals: TemplateDataTotals;
}

function stripHtml(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function buildAddress(parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join(", ");
}

function formatMoney(amount: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(amount);
}

function formatOptionalDate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      return null;
    }
    return new Intl.DateTimeFormat("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(d);
  } catch {
    return value;
  }
}

function getLineItemSubtype(
  content: Record<string, unknown> | null | undefined
): LineItemSubtype {
  const subtype = content?.line_item_subtype as string | undefined;
  if (
    subtype === "headline" ||
    subtype === "text" ||
    subtype === "page_break"
  ) {
    return subtype;
  }
  return "position";
}

function isPhaseBlock(block: OfferBlock): boolean {
  if (block.type === "phase") {
    return true;
  }
  return (
    block.type === "headline" &&
    (block.content_json?.is_phase as boolean) === true
  );
}

function isExcludedFromSubtotal(
  subtype: LineItemSubtype,
  unit: string
): boolean {
  return (
    subtype === "headline" ||
    subtype === "text" ||
    subtype === "page_break" ||
    unit === "text"
  );
}

function computePositions(blocks: OfferBlock[]): Map<string, string> {
  const positions = new Map<string, string>();
  const childrenMap = new Map<string, OfferBlock[]>();

  for (const block of blocks) {
    if (block.type === "line_item") {
      const parentId = block.content_json?.parent_id as string | undefined;
      if (parentId) {
        const list = childrenMap.get(parentId) ?? [];
        list.push(block);
        childrenMap.set(parentId, list);
      }
    }
  }

  const childIds = new Set<string>();
  for (const children of childrenMap.values()) {
    for (const child of children) {
      childIds.add(child.id);
    }
  }

  let sectionIndex = 0;
  let itemCounter = 0;
  let previousWasLineItem = false;

  for (const block of blocks) {
    if (
      isPhaseBlock(block) ||
      block.type === "headline" ||
      block.type === "subheading" ||
      block.type === "text"
    ) {
      previousWasLineItem = false;
      continue;
    }

    if (block.type !== "line_item") {
      previousWasLineItem = false;
      continue;
    }

    if (childIds.has(block.id)) {
      continue;
    }

    if (!previousWasLineItem) {
      sectionIndex += 1;
      itemCounter = 0;
    }
    previousWasLineItem = true;

    const subtype = getLineItemSubtype(block.content_json);
    const children = childrenMap.get(block.id) ?? [];

    if (subtype === "headline") {
      if (children.length > 0) {
        itemCounter += 1;
        positions.set(block.id, `${sectionIndex}.${itemCounter}`);
      } else {
        if (itemCounter > 0) {
          sectionIndex += 1;
          itemCounter = 0;
        }
        positions.set(block.id, `${sectionIndex}`);
      }
      continue;
    }

    if (subtype === "text" || subtype === "page_break") {
      continue;
    }

    itemCounter += 1;
    positions.set(block.id, `${sectionIndex}.${itemCounter}`);
  }

  for (const [parentId, children] of childrenMap) {
    const parentPos = positions.get(parentId);
    if (!parentPos) {
      continue;
    }
    for (let i = 0; i < children.length; i++) {
      positions.set(children[i].id, `${parentPos}.${i + 1}`);
    }
  }

  return positions;
}

interface BuildParams {
  blocks: OfferBlock[];
  commercialSettings: Record<string, unknown> | null;
  companyProfile: Record<string, unknown> | null;
  offer: OfferListItem;
}

export function buildOfferTemplateData(params: BuildParams): OfferTemplateData {
  const locale =
    (params.commercialSettings?.default_locale as string | null) ?? "de-DE";
  const currency = params.offer.currency;
  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  });
  const defaultTaxRate = params.offer.default_tax_rate;
  const phasesEnabled = params.offer.phases_enabled ?? false;
  const showPhaseTotals =
    phasesEnabled &&
    (params.offer.show_phase_totals ??
      (params.commercialSettings?.show_phase_totals as boolean | null) ??
      false);
  const showTaxPerItem = params.offer.show_tax_per_item ?? true;
  const noTaxReason =
    params.offer.no_tax_reason ??
    (params.commercialSettings?.no_tax_reason as string | null) ??
    null;

  const sortedBlocks = [...params.blocks].sort(
    (a, b) => a.order_index - b.order_index
  );
  const positions = computePositions(sortedBlocks);
  const childrenMap = new Map<string, OfferBlock[]>();

  for (const block of sortedBlocks) {
    if (block.type === "line_item") {
      const parentId = block.content_json?.parent_id as string | undefined;
      if (parentId) {
        const list = childrenMap.get(parentId) ?? [];
        list.push(block);
        childrenMap.set(parentId, list);
      }
    }
  }

  const childIds = new Set<string>();
  for (const children of childrenMap.values()) {
    for (const child of children) {
      childIds.add(child.id);
    }
  }

  function blockToItem(
    block: OfferBlock,
    blockPosition: string,
    entryPosition: string,
    displayPosition: string
  ): TemplateDataItem {
    const c = block.content_json as Record<string, unknown>;
    const amount = Number(c.amount ?? c.quantity ?? 1);
    const unit = String(c.unit ?? "h");
    const costPerItem = Number(c.cost_per_item ?? c.unit_price ?? 0);
    // item_total is only authoritative when set: the editor persists 0 as a
    // placeholder (flat-price items carry their price here), so fall back to
    // amount × unit price — the same math the editor shows live.
    const storedTotal = Number(c.item_total ?? 0);
    const total = storedTotal || amount * costPerItem;
    const taxRate = Number(c.tax ?? c.tax_rate ?? defaultTaxRate);
    const subtype = getLineItemSubtype(c);

    return {
      position: displayPosition,
      block_position: blockPosition,
      entry_position: entryPosition,
      amount,
      unit,
      unit_display: unit === "h" ? "h" : undefined,
      title: String(c.title ?? ""),
      content: stripHtml(String(c.content ?? "")) || null,
      tax: taxRate,
      tax_formatted: `${taxRate}%`,
      cost_per_item: costPerItem,
      total,
      cost_per_item_formatted: formatter.format(costPerItem),
      total_formatted: formatter.format(total),
      line_item_subtype: subtype,
    };
  }

  const groups: TemplateDataGroup[] = [];
  let currentGroup: TemplateDataGroup | null = null;
  let currentSection: TemplateDataSection | null = null;
  let currentLineItems: {
    title: string | null;
    content: string | null;
    entries: TemplateDataLineItemsEntry[];
  } | null = null;
  let sectionIndex = 0;

  const ensureGroup = (
    type: "general" | "phase",
    phase: TemplateDataPhase | null
  ) => {
    if (currentGroup) {
      return;
    }
    currentGroup = {
      type,
      phase,
      sections: [],
      subtotal: 0,
      subtotal_formatted: "",
    };
    sectionIndex = 0;
    currentSection = null;
  };

  const flushLineItems = () => {
    if (!(currentSection && currentLineItems)) {
      return;
    }
    const blockIndex = currentSection.blocks.length + 1;
    const blockPosition = `${currentSection.index}.${blockIndex}`;
    const entries: TemplateDataLineItemsEntry[] = [];
    let blockSubtotal = 0;

    for (let i = 0; i < currentLineItems.entries.length; i++) {
      const entry = currentLineItems.entries[i];
      const entryPosition = `${blockPosition}.${i + 1}`;

      if (entry.type === "item") {
        blockSubtotal += entry.item.total;
        entries.push(entry);
      } else {
        blockSubtotal += entry.bundle.subtotal;
        entries.push(entry);
      }
    }

    currentSection.blocks.push({
      position: blockPosition,
      type: "line_items",
      title: currentLineItems.title,
      content: currentLineItems.content,
      entries,
      subtotal: blockSubtotal,
      subtotal_formatted: formatter.format(blockSubtotal),
    });
    currentLineItems = null;
  };

  const flushSection = () => {
    if (!currentGroup) {
      return;
    }
    flushLineItems();
    if (currentSection) {
      const subtotal = currentSection.blocks.reduce(
        (sum, b) => sum + b.subtotal,
        0
      );
      currentGroup.sections.push({
        ...currentSection,
        subtotal,
        subtotal_formatted: formatter.format(subtotal),
      });
    }
    currentSection = null;
  };

  const flushGroup = () => {
    flushSection();
    if (currentGroup) {
      const subtotal = currentGroup.sections.reduce(
        (sum, s) => sum + s.subtotal,
        0
      );
      groups.push({
        ...currentGroup,
        subtotal,
        subtotal_formatted: formatter.format(subtotal),
      });
      currentGroup = null;
      currentSection = null;
      currentLineItems = null;
      sectionIndex = 0;
    }
  };

  const ensureSection = (title: string | null) => {
    sectionIndex += 1;
    if (currentSection) {
      flushLineItems();
      const subtotal = currentSection.blocks.reduce(
        (sum, b) => sum + b.subtotal,
        0
      );
      currentGroup?.sections.push({
        ...currentSection,
        subtotal,
        subtotal_formatted: formatter.format(subtotal),
      });
    }
    currentSection = {
      index: sectionIndex,
      title,
      content: [],
      blocks: [],
      subtotal: 0,
      subtotal_formatted: "",
    };
  };

  const timeframeFrom = formatOptionalDate(params.offer.offer_date);
  const timeframeUntil = formatOptionalDate(params.offer.valid_until);

  for (const block of sortedBlocks) {
    if (childIds.has(block.id)) {
      continue;
    }

    if (isPhaseBlock(block)) {
      if (!phasesEnabled) {
        ensureGroup("general", null);
        flushSection();
        const c = block.content_json as Record<string, unknown>;
        ensureSection(String(c?.title ?? ""));
        const content = stripHtml(String(c?.content ?? c?.text ?? ""));
        if (content && currentSection) {
          currentSection.content.push({ type: "text", content });
        }
        continue;
      }

      flushGroup();
      const c = block.content_json as Record<string, unknown>;
      const phase: TemplateDataPhase = {
        title: String(c?.title ?? "").trim() || null,
        content: stripHtml(String(c?.content ?? c?.text ?? "")) || null,
        billing_type: (c?.billing_type as string | null) ?? null,
        timeframe_from:
          formatOptionalDate(c?.timeframe_from as string) ?? timeframeFrom,
        timeframe_until:
          formatOptionalDate(c?.timeframe_until as string) ?? timeframeUntil,
      };
      ensureGroup("phase", phase);
      continue;
    }

    if (block.type === "headline" || block.type === "subheading") {
      const c = block.content_json as Record<string, unknown>;
      const isPhaseHeadline =
        block.type === "headline" && (c?.is_phase as boolean) === true;
      if (
        block.type === "headline" &&
        !isPhaseHeadline &&
        currentGroup?.type === "phase"
      ) {
        flushGroup();
      }
      ensureGroup("general", null);
      flushSection();
      ensureSection(String(c?.title ?? ""));
      if (block.type === "headline" && c?.content) {
        currentSection?.content.push({
          type: "text",
          content: stripHtml(String(c.content)) || null,
        });
      }
      continue;
    }

    if (block.type === "text") {
      ensureGroup("general", null);
      if (!currentSection) {
        ensureSection(null);
      }
      const c = block.content_json as Record<string, unknown>;
      currentSection?.content.push({
        type: "text",
        content: stripHtml(String(c?.content ?? c?.text ?? "")) || null,
      });
      continue;
    }

    if (block.type === "line_item") {
      ensureGroup("general", null);
      if (!currentSection) {
        ensureSection(null);
      }

      if (!currentLineItems) {
        currentLineItems = {
          title: null,
          content: null,
          entries: [],
        };
      }

      const pos = positions.get(block.id) ?? "";
      const blockPos = `${currentSection!.index}.${currentSection!.blocks.length + 1}`;
      const entryPos = `${blockPos}.${currentLineItems.entries.length + 1}`;

      const children = childrenMap.get(block.id) ?? [];
      if (children.length > 0) {
        const bundleItems: TemplateDataItem[] = children.map((child, idx) => {
          const childPos = positions.get(child.id) ?? `${pos}.${idx + 1}`;
          return blockToItem(child, blockPos, entryPos, childPos);
        });
        const bundleSubtotal = bundleItems.reduce(
          (sum, it) =>
            isExcludedFromSubtotal(it.line_item_subtype ?? "position", it.unit)
              ? sum
              : sum + it.total,
          0
        );
        const c = block.content_json as Record<string, unknown>;
        currentLineItems.entries.push({
          type: "bundle",
          bundle: {
            position: pos,
            title: String(c?.title ?? "").trim() || null,
            content: stripHtml(String(c?.content ?? "")) || null,
            items: bundleItems,
            subtotal: bundleSubtotal,
            subtotal_formatted: formatter.format(bundleSubtotal),
          },
        });
      } else {
        const item = blockToItem(block, blockPos, entryPos, pos);
        currentLineItems.entries.push({ type: "item", item });
      }
    }
  }

  flushGroup();

  const allItems: TemplateDataItem[] = [];
  for (const group of groups) {
    for (const section of group.sections) {
      for (const blk of section.blocks) {
        for (const entry of blk.entries) {
          if (entry.type === "item") {
            if (
              !isExcludedFromSubtotal(
                entry.item.line_item_subtype ?? "position",
                entry.item.unit
              )
            ) {
              allItems.push(entry.item);
            }
          } else {
            for (const it of entry.bundle.items) {
              if (
                !isExcludedFromSubtotal(
                  it.line_item_subtype ?? "position",
                  it.unit
                )
              ) {
                allItems.push(it);
              }
            }
          }
        }
      }
    }
  }

  const subtotal = allItems.reduce((sum, it) => sum + it.total, 0);
  const taxByRate = new Map<number, number>();
  for (const it of allItems) {
    if (it.tax) {
      const taxAmount = it.total * (it.tax / 100);
      taxByRate.set(it.tax, (taxByRate.get(it.tax) ?? 0) + taxAmount);
    }
  }
  const taxes = Array.from(taxByRate.entries())
    .map(([rate, amount]) => ({
      rate,
      amount,
      rate_formatted: `${rate}%`,
      amount_formatted: formatter.format(amount),
    }))
    .sort((a, b) => b.rate - a.rate);
  const taxAmount = taxes.reduce((sum, t) => sum + t.amount, 0);
  const total = subtotal + taxAmount;

  const phaseTotals = groups
    .filter((g) => g.type === "phase")
    .map((g) => ({
      title: g.phase?.title ?? null,
      label: g.phase?.title ?? "Phase",
      subtotal: g.subtotal,
      subtotal_formatted: g.subtotal_formatted,
    }));

  const companyProfile = params.companyProfile ?? {};
  const addressParts = [
    companyProfile.address_street,
    companyProfile.address_zip,
    companyProfile.address_city,
    companyProfile.address_country,
  ].filter(Boolean) as string[];

  return {
    offer: {
      id: params.offer.id,
      offer_number: params.offer.offer_number,
      title: params.offer.title,
      introduction: stripHtml(params.offer.introduction) || null,
      final_notes: stripHtml(params.offer.final_notes) || null,
      created_at: formatOptionalDate(params.offer.offer_date) ?? "",
      valid_until: formatOptionalDate(params.offer.valid_until) ?? "",
      reference: params.offer.reference,
      timeframe_from: timeframeFrom,
      timeframe_until: timeframeUntil,
    },
    recipient: {
      company_name: params.offer.recipient_name ?? "",
      contact_name: null,
      email: params.offer.recipient_email,
      address_street: null,
      address_zip: null,
      address_city: null,
      address_country: null,
      address_full: params.offer.recipient_address ?? "",
      show_contact_name: params.offer.show_contact_name,
      show_contact_email: params.offer.show_contact_email,
      custom_info: params.offer.recipient_custom_info,
    },
    sender: {
      company_name:
        (companyProfile.brand_name as string) ??
        (companyProfile.name as string) ??
        "Your Company",
      logo_url: (companyProfile.logo_url as string) ?? null,
      address_street: (companyProfile.address_street as string) ?? null,
      address_zip: (companyProfile.address_zip as string) ?? null,
      address_city: (companyProfile.address_city as string) ?? null,
      address_country: (companyProfile.address_country as string) ?? null,
      address_full: buildAddress(addressParts) || "",
      email: (companyProfile.email as string) ?? null,
      phone: (companyProfile.phone as string) ?? null,
      website: (companyProfile.website as string) ?? null,
      iban: (companyProfile.iban as string) ?? null,
      bic: (companyProfile.bic as string) ?? null,
      bank_name: (companyProfile.bank_name as string) ?? null,
      bank_account_name: (companyProfile.bank_account_name as string) ?? null,
      vat_id: (companyProfile.vat_id as string) ?? null,
      company_registration_number:
        (companyProfile.company_registration_number as string) ?? null,
      tax_number: (companyProfile.tax_number as string) ?? null,
    },
    content: groups,
    totals: {
      subtotal,
      taxAmount,
      total,
      currency,
      subtotal_formatted: formatter.format(subtotal),
      taxAmount_formatted: formatter.format(taxAmount),
      total_formatted: formatter.format(total),
      taxes,
      show_taxes: taxes.length > 0,
      no_tax_reason: noTaxReason,
      phase_totals: phaseTotals,
      show_phase_totals: showPhaseTotals,
    },
    config: {
      phase_numbering_format: "phase_n",
      show_phase_subtotals:
        phasesEnabled && (params.offer.show_phase_totals ?? false),
      show_tax_per_item: showTaxPerItem,
      show_phase_totals: showPhaseTotals,
    },
  };
}
