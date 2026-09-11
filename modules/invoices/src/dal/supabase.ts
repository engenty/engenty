import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { uuidv7 } from "uuidv7";
import {
  computeInvoiceTotals,
  DEFAULT_INVOICE_SETTINGS,
  formatInvoiceNumber,
  InvoiceFinalizedError,
  parseInvoiceDisplayNumber,
} from "../lib/invoice-commercial.js";
import type {
  Invoice,
  InvoiceBlock,
  InvoiceBlockInput,
  InvoiceInput,
  InvoiceRecipientSnapshot,
  InvoiceSettings,
  InvoiceSettingsInput,
  InvoiceStatus,
} from "../schema/types.js";
import { invoiceFilePath } from "./pathing.js";

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function rowToInvoice(row: Record<string, unknown>): Invoice {
  let recipientSnapshot: InvoiceRecipientSnapshot | undefined;
  const raw = row.recipient_snapshot;
  if (raw && typeof raw === "object") {
    recipientSnapshot = raw as unknown as InvoiceRecipientSnapshot;
  } else if (typeof raw === "string" && raw.length > 0) {
    try {
      recipientSnapshot = JSON.parse(raw) as InvoiceRecipientSnapshot;
    } catch {
      recipientSnapshot = undefined;
    }
  }

  return {
    id: String(row.id),
    number: String(row.number),
    date: String(row.date),
    dueDate: String(row.due_date ?? row.date),
    content: str(row.content),
    sumNetto: Number(row.sum_netto),
    tax: Number(row.tax),
    sumBrutto: Number(row.sum_brutto),
    clientId: str(row.client_id),
    recipientSnapshot,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at ?? row.created_at),
    status: (str(row.status) as InvoiceStatus) ?? "draft",
    title: str(row.title) ?? null,
    reference: str(row.reference) ?? null,
    issuedAt: str(row.issued_at) ?? null,
    correctsInvoiceId: str(row.corrects_invoice_id) ?? null,
    currency: str(row.currency) ?? "EUR",
    introduction: str(row.introduction) ?? null,
    finalNotes: str(row.final_notes) ?? null,
    recipientName: str(row.recipient_name) ?? null,
    recipientAddress: str(row.recipient_address) ?? null,
    recipientEmail: str(row.recipient_email) ?? null,
    recipientCustomInfo: str(row.recipient_custom_info) ?? null,
    showContactName: bool(row.show_contact_name, true),
    showContactEmail: bool(row.show_contact_email, true),
    billingType:
      (str(row.billing_type) as Invoice["billingType"]) ?? "fixed_price",
    billingInterval:
      (str(row.billing_interval) as Invoice["billingInterval"]) ?? null,
    retainerAmount:
      row.retainer_amount == null ? null : Number(row.retainer_amount),
    spilloverRules: str(row.spillover_rules) ?? null,
    allowsFixedPositions: bool(row.allows_fixed_positions, false),
    usageBased: bool(row.usage_based, false),
    defaultTaxRate:
      row.default_tax_rate == null ? 20 : Number(row.default_tax_rate),
    showTaxPerItem: bool(row.show_tax_per_item, false),
    noTaxReason: str(row.no_tax_reason) ?? null,
    phasesEnabled: bool(row.phases_enabled, false),
    showPhaseIndex: bool(row.show_phase_index, false),
    phaseIndexPattern: str(row.phase_index_pattern) ?? "1.",
    showPhaseTotals: bool(row.show_phase_totals, false),
    metadataJson: (row.metadata_json as Record<string, unknown> | null) ?? {},
    settingsJson: (row.settings_json as Record<string, unknown> | null) ?? {},
    templateId: str(row.template_id) ?? null,
  };
}

function rowToBlock(row: Record<string, unknown>): InvoiceBlock {
  return {
    id: String(row.id),
    invoice_id: String(row.invoice_id),
    tenant_id: String(row.tenant_id),
    scope_id: String(row.scope_id),
    type: String(row.type) as InvoiceBlock["type"],
    content_json: (row.content_json as Record<string, unknown> | null) ?? {},
    order_index: Number(row.order_index ?? 0),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

/** Maps the commercial/optional invoice fields to their DB columns. */
function commercialColumns(inv: Partial<Invoice>): Record<string, unknown> {
  const cols: Record<string, unknown> = {};
  const set = (key: string, value: unknown) => {
    if (value !== undefined) {
      cols[key] = value;
    }
  };
  set("title", inv.title ?? null);
  set("reference", inv.reference ?? null);
  set("status", inv.status);
  set("issued_at", inv.issuedAt ?? null);
  set("corrects_invoice_id", inv.correctsInvoiceId ?? null);
  set("currency", inv.currency);
  set("introduction", inv.introduction ?? null);
  set("final_notes", inv.finalNotes ?? null);
  set("recipient_name", inv.recipientName ?? null);
  set("recipient_address", inv.recipientAddress ?? null);
  set("recipient_email", inv.recipientEmail ?? null);
  set("recipient_custom_info", inv.recipientCustomInfo ?? null);
  set("show_contact_name", inv.showContactName);
  set("show_contact_email", inv.showContactEmail);
  set("billing_type", inv.billingType);
  set("billing_interval", inv.billingInterval ?? null);
  set("retainer_amount", inv.retainerAmount ?? null);
  set("spillover_rules", inv.spilloverRules ?? null);
  set("allows_fixed_positions", inv.allowsFixedPositions);
  set("usage_based", inv.usageBased);
  set("default_tax_rate", inv.defaultTaxRate);
  set("show_tax_per_item", inv.showTaxPerItem);
  set("no_tax_reason", inv.noTaxReason ?? null);
  set("phases_enabled", inv.phasesEnabled);
  set("show_phase_index", inv.showPhaseIndex);
  set("phase_index_pattern", inv.phaseIndexPattern);
  set("show_phase_totals", inv.showPhaseTotals);
  set("metadata_json", inv.metadataJson);
  set("settings_json", inv.settingsJson);
  set("template_id", inv.templateId ?? null);
  return cols;
}

export type InvoiceRepoSupabase = ReturnType<typeof createInvoiceRepoSupabase>;

export function createInvoiceRepoSupabase(
  adapter: unknown,
  tenantId: string,
  scopeId: string,
  dataDir?: string
) {
  const supabase = adapter as SupabaseClient;
  const schema = "module_invoices";
  const invoices = () => supabase.schema(schema).from("invoices");
  const blocks = () => supabase.schema(schema).from("invoice_blocks");
  const settingsTable = () => supabase.schema(schema).from("settings");
  const baseDir = dataDir ?? path.join(process.cwd(), "data", "invoices");

  const repo = {
    async create(input: InvoiceInput): Promise<Invoice> {
      const id = uuidv7();
      const createdAt = new Date().toISOString();
      const invoice: Invoice = {
        ...input,
        id,
        createdAt,
        updatedAt: createdAt,
        status: input.status ?? "draft",
      };

      const { data: inserted, error } = await invoices()
        .insert({
          id: invoice.id,
          tenant_id: tenantId,
          scope_id: scopeId,
          number: invoice.number,
          date: invoice.date,
          due_date: invoice.dueDate,
          content: invoice.content ?? null,
          sum_netto: invoice.sumNetto,
          tax: invoice.tax,
          sum_brutto: invoice.sumBrutto,
          client_id: invoice.clientId ?? null,
          recipient_snapshot: invoice.recipientSnapshot
            ? (invoice.recipientSnapshot as unknown as Record<string, unknown>)
            : null,
          created_at: invoice.createdAt,
          updated_at: invoice.createdAt,
          ...commercialColumns(invoice),
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create invoice: ${error.message}`);
      }
      return inserted
        ? rowToInvoice(inserted as Record<string, unknown>)
        : invoice;
    },

    async list(): Promise<Invoice[]> {
      const { data, error } = await invoices()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .is("deleted_at", null)
        .order("date", { ascending: false });

      if (error) {
        throw new Error(`Failed to list invoices: ${error.message}`);
      }
      return (data ?? []).map((row) =>
        rowToInvoice(row as Record<string, unknown>)
      );
    },

    async getById(id: string): Promise<Invoice | null> {
      const { data, error } = await invoices()
        .select("*")
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .is("deleted_at", null)
        .single();
      if (error || !data) {
        return null;
      }
      return rowToInvoice(data as Record<string, unknown>);
    },

    async getByNumber(number: string): Promise<Invoice | null> {
      const { data, error } = await invoices()
        .select("*")
        .eq("number", number)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .is("deleted_at", null)
        .single();
      if (error || !data) {
        return null;
      }
      return rowToInvoice(data as Record<string, unknown>);
    },

    async get(idOrNumber: string): Promise<Invoice | null> {
      const byId = await this.getById(idOrNumber);
      if (byId) {
        return byId;
      }
      return this.getByNumber(idOrNumber);
    },

    async update(
      id: string,
      input: Omit<Partial<InvoiceInput>, "clientId" | "recipientSnapshot"> & {
        clientId?: string | null;
        recipientSnapshot?: InvoiceRecipientSnapshot | null;
      }
    ): Promise<Invoice | null> {
      const existing = await this.getById(id);
      if (!existing) {
        return null;
      }
      // Immutability boundary: only drafts are editable (plan 008, decision #6).
      if (existing.status !== "draft") {
        throw new InvoiceFinalizedError();
      }

      const merged: Invoice = {
        ...existing,
        ...input,
        clientId:
          input.clientId === null
            ? undefined
            : (input.clientId ?? existing.clientId),
        recipientSnapshot:
          input.recipientSnapshot === null
            ? undefined
            : (input.recipientSnapshot ?? existing.recipientSnapshot),
        id: existing.id,
        createdAt: existing.createdAt,
        status: existing.status,
      };

      const { error } = await invoices()
        .update({
          number: merged.number,
          date: merged.date,
          due_date: merged.dueDate,
          content: merged.content ?? null,
          sum_netto: merged.sumNetto,
          tax: merged.tax,
          sum_brutto: merged.sumBrutto,
          client_id: merged.clientId ?? null,
          recipient_snapshot: merged.recipientSnapshot
            ? (merged.recipientSnapshot as unknown as Record<string, unknown>)
            : null,
          updated_at: new Date().toISOString(),
          ...commercialColumns(merged),
        })
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId);
      if (error) {
        throw new Error(`Failed to update invoice: ${error.message}`);
      }
      return merged;
    },

    async delete(id: string): Promise<boolean> {
      const existing = await this.getById(id);
      if (!existing) {
        return false;
      }
      if (existing.status !== "draft") {
        throw new InvoiceFinalizedError(
          "Issued invoices cannot be deleted — cancel via a Storno instead."
        );
      }
      const { error } = await invoices()
        .update({
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId);
      if (error) {
        throw new Error(`Failed to delete invoice: ${error.message}`);
      }
      return true;
    },

    async listByClient(clientId: string): Promise<Invoice[]> {
      const { data, error } = await invoices()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("client_id", clientId)
        .is("deleted_at", null)
        .order("date", { ascending: false });
      if (error) {
        throw new Error(`Failed to list invoices by client: ${error.message}`);
      }
      return (data ?? []).map((row) =>
        rowToInvoice(row as Record<string, unknown>)
      );
    },

    async countByClientIds(
      clientIds: string[]
    ): Promise<Record<string, number>> {
      if (clientIds.length === 0) {
        return {};
      }
      const { data, error } = await supabase.rpc(
        "module_invoices_count_invoices_by_client_ids",
        {
          p_tenant_id: tenantId,
          p_scope_id: scopeId,
          p_client_ids: clientIds,
        }
      );
      if (error) {
        throw new Error(
          `Failed to count invoices by client ids: ${error.message}`
        );
      }
      const map: Record<string, number> = {};
      for (const id of clientIds) {
        map[id] = 0;
      }
      for (const row of data ?? []) {
        const r = row as { client_id: string; invoice_count: number };
        map[String(r.client_id)] = Number(r.invoice_count);
      }
      return map;
    },

    // --- Blocks --------------------------------------------------------------

    async listBlocks(invoiceId: string): Promise<InvoiceBlock[]> {
      const { data, error } = await blocks()
        .select("*")
        .eq("invoice_id", invoiceId)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .order("order_index", { ascending: true });
      if (error) {
        throw new Error(`Failed to list invoice blocks: ${error.message}`);
      }
      return (data ?? []).map((row) =>
        rowToBlock(row as Record<string, unknown>)
      );
    },

    /**
     * Atomically replaces an invoice's blocks and recomputes cached totals.
     * Rejected once the invoice is finalized (immutability boundary).
     */
    async replaceBlocks(
      invoiceId: string,
      nextBlocks: InvoiceBlockInput[]
    ): Promise<InvoiceBlock[]> {
      const existing = await this.getById(invoiceId);
      if (!existing) {
        throw new Error(`Invoice ${invoiceId} not found`);
      }
      if (existing.status !== "draft") {
        throw new InvoiceFinalizedError();
      }

      const { error: deleteError } = await blocks()
        .delete()
        .eq("invoice_id", invoiceId)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId);
      if (deleteError) {
        throw new Error(
          `Failed to clear invoice blocks: ${deleteError.message}`
        );
      }

      const now = new Date().toISOString();
      const rows = nextBlocks.map((block, index) => ({
        id: block.id || uuidv7(),
        tenant_id: tenantId,
        scope_id: scopeId,
        invoice_id: invoiceId,
        type: block.type,
        content_json: block.content_json,
        order_index: block.order_index ?? index,
        created_at: now,
        updated_at: now,
      }));

      if (rows.length > 0) {
        const { error: insertError } = await blocks().insert(rows);
        if (insertError) {
          throw new Error(
            `Failed to insert invoice blocks: ${insertError.message}`
          );
        }
      }

      // Write through cached totals from the new line items.
      const totals = computeInvoiceTotals(
        nextBlocks,
        existing.defaultTaxRate ?? 20
      );
      const { error: totalsError } = await invoices()
        .update({
          sum_netto: totals.net,
          tax: totals.tax,
          sum_brutto: totals.gross,
          updated_at: now,
        })
        .eq("id", invoiceId)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId);
      if (totalsError) {
        throw new Error(
          `Failed to update invoice totals: ${totalsError.message}`
        );
      }

      return this.listBlocks(invoiceId);
    },

    // --- Lifecycle -----------------------------------------------------------

    /** Festschreibung: draft → issued. Freezes the invoice and stamps issued_at. */
    async issue(id: string): Promise<Invoice | null> {
      const existing = await this.getById(id);
      if (!existing) {
        return null;
      }
      if (existing.status !== "draft") {
        throw new InvoiceFinalizedError("Only draft invoices can be issued.");
      }
      return this.setStatus(id, "issued", {
        issuedAt: new Date().toISOString(),
      });
    },

    /** Transitions an invoice's status (used by sent/paid). */
    async setStatus(
      id: string,
      status: InvoiceStatus,
      extra?: { issuedAt?: string }
    ): Promise<Invoice | null> {
      const existing = await this.getById(id);
      if (!existing) {
        return null;
      }
      const patch: Record<string, unknown> = {
        status,
        updated_at: new Date().toISOString(),
      };
      if (extra?.issuedAt) {
        patch.issued_at = extra.issuedAt;
      }
      const { error } = await invoices()
        .update(patch)
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId);
      if (error) {
        throw new Error(`Failed to set invoice status: ${error.message}`);
      }
      return this.getById(id);
    },

    /**
     * Cancels an issued invoice by creating a linked Storno (negative mirror) and
     * marking the original `cancelled`. The original row is retained.
     */
    async cancel(id: string): Promise<{ original: Invoice; storno: Invoice }> {
      const original = await this.getById(id);
      if (!original) {
        throw new Error(`Invoice ${id} not found`);
      }
      if (original.status === "draft") {
        throw new Error("Draft invoices are deleted, not cancelled.");
      }
      if (original.status === "cancelled") {
        throw new Error("Invoice is already cancelled.");
      }

      const stornoNumber = await this.getNextNumber();
      const today = new Date().toISOString().slice(0, 10);
      const storno = await this.create({
        number: stornoNumber,
        date: today,
        dueDate: today,
        sumNetto: -original.sumNetto,
        tax: -original.tax,
        sumBrutto: -original.sumBrutto,
        clientId: original.clientId,
        recipientSnapshot: original.recipientSnapshot,
        status: "issued",
        title: `Storno ${original.number}`,
        correctsInvoiceId: original.id,
        currency: original.currency,
        issuedAt: new Date().toISOString(),
      });

      // Mirror the original's blocks with negated quantities.
      const originalBlocks = await this.listBlocks(id);
      if (originalBlocks.length > 0) {
        await this.forceReplaceBlocks(
          storno.id,
          originalBlocks.map((b) => ({
            id: uuidv7(),
            invoice_id: storno.id,
            type: b.type,
            content_json: negateLineItem(b.content_json, b.type),
            order_index: b.order_index,
          }))
        );
      }

      const updatedOriginal = await this.setStatus(id, "cancelled");
      return { original: updatedOriginal ?? original, storno };
    },

    /** Internal block replace that bypasses the draft guard (Storno mirror). */
    async forceReplaceBlocks(
      invoiceId: string,
      nextBlocks: InvoiceBlockInput[]
    ): Promise<void> {
      const now = new Date().toISOString();
      await blocks()
        .delete()
        .eq("invoice_id", invoiceId)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId);
      const rows = nextBlocks.map((block, index) => ({
        id: block.id || uuidv7(),
        tenant_id: tenantId,
        scope_id: scopeId,
        invoice_id: invoiceId,
        type: block.type,
        content_json: block.content_json,
        order_index: block.order_index ?? index,
        created_at: now,
        updated_at: now,
      }));
      if (rows.length > 0) {
        await blocks().insert(rows);
      }
    },

    // --- Settings ------------------------------------------------------------

    async getSettings(): Promise<InvoiceSettings> {
      const { data, error } = await settingsTable()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .maybeSingle();
      if (error || !data) {
        return { ...DEFAULT_INVOICE_SETTINGS };
      }
      const row = data as Record<string, unknown>;
      return {
        invoice_id_prefix:
          str(row.invoice_id_prefix) ??
          DEFAULT_INVOICE_SETTINGS.invoice_id_prefix,
        invoice_id_offset:
          row.invoice_id_offset == null
            ? DEFAULT_INVOICE_SETTINGS.invoice_id_offset
            : Number(row.invoice_id_offset),
        invoice_id_postfix:
          (row.invoice_id_postfix as string | null) ??
          DEFAULT_INVOICE_SETTINGS.invoice_id_postfix,
        default_intro:
          (row.default_intro as string | null) ??
          DEFAULT_INVOICE_SETTINGS.default_intro,
        default_final_notes:
          (row.default_final_notes as string | null) ??
          DEFAULT_INVOICE_SETTINGS.default_final_notes,
        due_in_days:
          row.due_in_days == null
            ? DEFAULT_INVOICE_SETTINGS.due_in_days
            : Number(row.due_in_days),
      };
    },

    async setSettings(input: InvoiceSettingsInput): Promise<InvoiceSettings> {
      const current = await this.getSettings();
      const next: InvoiceSettings = { ...current, ...input };
      const { error } = await settingsTable().upsert(
        {
          tenant_id: tenantId,
          scope_id: scopeId,
          invoice_id_prefix: next.invoice_id_prefix,
          invoice_id_offset: next.invoice_id_offset,
          invoice_id_postfix: next.invoice_id_postfix,
          default_intro: next.default_intro,
          default_final_notes: next.default_final_notes,
          due_in_days: next.due_in_days,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id,scope_id" }
      );
      if (error) {
        throw new Error(`Failed to save invoice settings: ${error.message}`);
      }
      return next;
    },

    // --- Number generation ---------------------------------------------------

    async getNextNumber(settingsOverride?: InvoiceSettings): Promise<string> {
      const settings = settingsOverride ?? (await this.getSettings());
      const { data, error } = await invoices()
        .select("number")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId);
      if (error) {
        throw new Error(`Failed to read invoice numbers: ${error.message}`);
      }
      let highest = settings.invoice_id_offset;
      for (const row of data ?? []) {
        const parsed = parseInvoiceDisplayNumber(
          String((row as { number: unknown }).number)
        );
        if (parsed != null && parsed > highest) {
          highest = parsed;
        }
      }
      return formatInvoiceNumber(settings, highest + 1);
    },

    async numberExists(number: string, excludeId?: string): Promise<boolean> {
      let query = invoices()
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("number", number)
        .is("deleted_at", null);
      if (excludeId) {
        query = query.neq("id", excludeId);
      }
      const { data, error } = await query.limit(1);
      if (error) {
        throw new Error(`Failed to check invoice number: ${error.message}`);
      }
      return (data ?? []).length > 0;
    },

    filePath(inv: Invoice): string {
      return invoiceFilePath(baseDir, inv);
    },
  };

  return repo;
}

function negateLineItem(
  content: Record<string, unknown>,
  type: string
): Record<string, unknown> {
  if (type !== "line_item") {
    return content;
  }
  const next = { ...content };
  if (typeof next.amount === "number") {
    next.amount = -next.amount;
  }
  return next;
}
