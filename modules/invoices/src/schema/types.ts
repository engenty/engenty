export interface InvoiceRecipientSnapshot {
  address: {
    street: string;
    postalCode: string;
    city: string;
    country: string;
  };
  capturedAt: string;
  clientId: string;
  displayName: string;
  email?: string;
  kind: "organization" | "individual";
  legalName?: string;
  phone?: string;
  taxId?: string;
  vatId?: string;
}

/**
 * Legal invoice lifecycle (plan 008, decision #5/#6).
 * - `draft`: mutable, not yet an invoice in the legal sense (agent produces this).
 * - `issued`: Festschreibung — number frozen, blocks immutable (owner approval).
 * - `sent`: issued and delivered to the customer.
 * - `paid`: payment received in full.
 * - `cancelled`: reversed via a linked Storno document; original retained.
 */
export type InvoiceStatus = "draft" | "issued" | "sent" | "paid" | "cancelled";

export type InvoiceBillingType =
  | "fixed_price"
  | "time_and_materials"
  | "retainer"
  | "recurring";

export type InvoiceBillingInterval = "monthly" | "quarterly" | "yearly";

export interface Invoice {
  allowsFixedPositions?: boolean;
  billingInterval?: InvoiceBillingInterval | null;
  billingType?: InvoiceBillingType;
  clientId?: string;
  /** Legacy free-text content; superseded by blocks. Optional for new invoices. */
  content?: string;
  /** Self-reference to the invoice this Storno corrects. */
  correctsInvoiceId?: string | null;
  createdAt: string;
  currency?: string;
  date: string;
  defaultTaxRate?: number;
  dueDate: string;
  finalNotes?: string | null;
  id: string;
  introduction?: string | null;
  /** Timestamp of the draft → issued Festschreibung. */
  issuedAt?: string | null;
  metadataJson?: Record<string, unknown>;
  noTaxReason?: string | null;
  number: string;
  phaseIndexPattern?: string;
  phasesEnabled?: boolean;
  recipientAddress?: string | null;
  recipientCustomInfo?: string | null;
  recipientEmail?: string | null;
  recipientName?: string | null;
  recipientSnapshot?: InvoiceRecipientSnapshot;
  reference?: string | null;
  retainerAmount?: number | null;
  settingsJson?: Record<string, unknown>;
  showContactEmail?: boolean;
  showContactName?: boolean;
  showPhaseIndex?: boolean;
  showPhaseTotals?: boolean;
  showTaxPerItem?: boolean;
  spilloverRules?: string | null;
  status: InvoiceStatus;
  sumBrutto: number;
  sumNetto: number;
  tax: number;
  templateId?: string | null;
  title?: string | null;
  usageBased?: boolean;
}

export type InvoiceInput = Omit<Invoice, "id" | "createdAt" | "status"> & {
  status?: InvoiceStatus;
};

export type InvoiceUpdateInput = Partial<InvoiceInput>;

/** Block content model — identical to offers so the commercial editor is shared. */
export type InvoiceBlockType =
  | "phase"
  | "headline"
  | "subheading"
  | "text"
  | "line_item";

export interface InvoiceBlock {
  content_json: Record<string, unknown>;
  created_at: string;
  id: string;
  invoice_id: string;
  order_index: number;
  scope_id: string;
  tenant_id: string;
  type: InvoiceBlockType;
  updated_at: string;
}

export type InvoiceBlockInput = Omit<
  InvoiceBlock,
  "tenant_id" | "scope_id" | "created_at" | "updated_at"
>;

export interface InvoiceSettings {
  default_final_notes: string;
  default_intro: string;
  due_in_days: number;
  invoice_id_offset: number;
  invoice_id_postfix: string;
  invoice_id_prefix: string;
}

export type InvoiceSettingsInput = Partial<InvoiceSettings>;
