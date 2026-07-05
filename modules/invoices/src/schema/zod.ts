import { z } from "@hono/zod-openapi";

export const invoiceRecipientSnapshotSchema = z.object({
  clientId: z.string().min(1),
  kind: z.enum(["organization", "individual"]),
  displayName: z.string().min(1),
  legalName: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  taxId: z.string().optional(),
  vatId: z.string().optional(),
  address: z.object({
    street: z.string().min(1),
    postalCode: z.string().min(1),
    city: z.string().min(1),
    country: z.string().min(1),
  }),
  capturedAt: z.string(),
});

export const invoiceStatusSchema = z.enum([
  "draft",
  "issued",
  "sent",
  "paid",
  "cancelled",
]);

export const invoiceBillingTypeSchema = z.enum([
  "fixed_price",
  "time_and_materials",
  "retainer",
  "recurring",
]);

export const invoiceBillingIntervalSchema = z.enum([
  "monthly",
  "quarterly",
  "yearly",
]);

/** Commercial fields shared by the invoice entity and its create/update inputs. */
const invoiceCommercialShape = {
  title: z.string().nullable().optional(),
  reference: z.string().nullable().optional(),
  status: invoiceStatusSchema.optional(),
  issuedAt: z.string().nullable().optional(),
  correctsInvoiceId: z.string().nullable().optional(),
  currency: z.string().optional(),
  introduction: z.string().nullable().optional(),
  finalNotes: z.string().nullable().optional(),
  recipientName: z.string().nullable().optional(),
  recipientAddress: z.string().nullable().optional(),
  recipientEmail: z.string().nullable().optional(),
  recipientCustomInfo: z.string().nullable().optional(),
  showContactName: z.boolean().optional(),
  showContactEmail: z.boolean().optional(),
  billingType: invoiceBillingTypeSchema.optional(),
  billingInterval: invoiceBillingIntervalSchema.nullable().optional(),
  retainerAmount: z.number().nullable().optional(),
  spilloverRules: z.string().nullable().optional(),
  allowsFixedPositions: z.boolean().optional(),
  usageBased: z.boolean().optional(),
  defaultTaxRate: z.number().optional(),
  showTaxPerItem: z.boolean().optional(),
  noTaxReason: z.string().nullable().optional(),
  phasesEnabled: z.boolean().optional(),
  showPhaseIndex: z.boolean().optional(),
  phaseIndexPattern: z.string().optional(),
  showPhaseTotals: z.boolean().optional(),
  metadataJson: z.record(z.string(), z.unknown()).optional(),
  settingsJson: z.record(z.string(), z.unknown()).optional(),
  templateId: z.string().nullable().optional(),
} as const;

export const invoiceSchema = z.object({
  id: z.string(),
  number: z.string(),
  date: z.string(),
  dueDate: z.string(),
  content: z.string().optional(),
  sumNetto: z.number(),
  tax: z.number(),
  sumBrutto: z.number(),
  clientId: z.string().optional(),
  recipientSnapshot: invoiceRecipientSnapshotSchema.optional(),
  createdAt: z.string(),
  ...invoiceCommercialShape,
});

export const invoiceInputSchema = z.object({
  number: z.string().min(1),
  date: z.string().min(1),
  dueDate: z.string().min(1),
  content: z.string().optional(),
  sumNetto: z.number(),
  tax: z.number(),
  sumBrutto: z.number(),
  clientId: z.string().min(1).optional(),
  ...invoiceCommercialShape,
});

export const invoiceUpdateSchema = invoiceInputSchema.partial().extend({
  clientId: z.string().min(1).nullable().optional(),
});

// --- Blocks -----------------------------------------------------------------

export const invoiceBlockTypeSchema = z.enum([
  "phase",
  "headline",
  "subheading",
  "text",
  "line_item",
]);

export const invoiceBlockSchema = z.object({
  id: z.string(),
  invoice_id: z.string(),
  tenant_id: z.string(),
  scope_id: z.string(),
  type: invoiceBlockTypeSchema,
  content_json: z.record(z.string(), z.unknown()),
  order_index: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const invoiceBlockInputSchema = z.object({
  id: z.string().min(1),
  invoice_id: z.string().min(1),
  type: invoiceBlockTypeSchema,
  content_json: z.record(z.string(), z.unknown()),
  order_index: z.number().int(),
});

export const invoiceBlocksReplaceSchema = z.object({
  blocks: z.array(invoiceBlockInputSchema),
});

export const invoiceBlocksResponseSchema = z.object({
  data: z.array(invoiceBlockSchema),
});

// --- Settings ---------------------------------------------------------------

export const invoiceSettingsSchema = z.object({
  invoice_id_prefix: z.string(),
  invoice_id_offset: z.number().int(),
  invoice_id_postfix: z.string(),
  default_intro: z.string(),
  default_final_notes: z.string(),
  due_in_days: z.number().int(),
});

export const invoiceSettingsInputSchema = invoiceSettingsSchema.partial();

export const invoiceNumberCheckQuerySchema = z.object({
  value: z.string().min(1),
  excludeId: z.string().optional(),
});

export const invoiceNumberCheckResponseSchema = z.object({
  available: z.boolean(),
});

export const invoiceNumberNextResponseSchema = z.object({
  number: z.string(),
});

export const invoiceStatusTransitionSchema = z.object({
  status: invoiceStatusSchema,
});

export const invoiceIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const invoiceIdOrNumberParamsSchema = z.object({
  idOrNumber: z.string().min(1),
});

export const invoiceClientIdParamsSchema = z.object({
  clientId: z.string().min(1),
});

export const invoiceCountByClientIdsInputSchema = z.object({
  clientIds: z.array(z.string().min(1)).max(200),
});

export const invoiceCountByClientIdsOutputSchema = z.record(
  z.string(),
  z.number().int().nonnegative()
);

export const notFoundSchema = z.object({
  error: z.string(),
});

export const deleteInvoiceResponseSchema = z.object({
  ok: z.literal(true),
  id: z.string(),
});
