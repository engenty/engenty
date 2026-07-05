import { z } from "@hono/zod-openapi";

export const offerStatusSchema = z.enum(["draft", "ready", "accepted"]);
export const offerBillingTypeSchema = z.enum([
  "fixed_price",
  "time_and_materials",
  "retainer",
  "recurring",
]);
export const offerBillingIntervalSchema = z.enum([
  "monthly",
  "quarterly",
  "yearly",
]);
export const offerBlockTypeSchema = z.enum([
  "phase",
  "headline",
  "subheading",
  "text",
  "line_item",
]);

export const offerBillingPlanModeSchema = z.enum([
  "full_on_delivery",
  "deposit_balance",
  "milestones",
]);

export const offerBillingPlanSchema = z.object({
  mode: offerBillingPlanModeSchema,
  milestones: z.array(
    z.object({
      description: z.string(),
      date: z.string().nullable(),
      percent: z.number(),
    })
  ),
});

export const offerSchema = z.object({
  id: z.string(),
  tenant_id: z.string(),
  scope_id: z.string(),
  template_id: z.string().nullable(),
  client_id: z.string().nullable(),
  lead_id: z.string().nullable(),
  title: z.string().min(1),
  offer_number: z.string().min(1),
  status: offerStatusSchema,
  reference: z.string().nullable(),
  offer_date: z.string().nullable(),
  valid_until: z.string().nullable(),
  introduction: z.string().nullable(),
  final_notes: z.string().nullable(),
  currency: z.string(),
  recipient_name: z.string().nullable(),
  recipient_address: z.string().nullable(),
  recipient_email: z.string().nullable(),
  recipient_custom_info: z.string().nullable(),
  show_contact_name: z.boolean(),
  show_contact_email: z.boolean(),
  billing_type: offerBillingTypeSchema,
  billing_interval: offerBillingIntervalSchema.nullable(),
  retainer_amount: z.number().nullable(),
  spillover_rules: z.string().nullable(),
  allows_fixed_positions: z.boolean(),
  usage_based: z.boolean(),
  default_tax_rate: z.number(),
  show_tax_per_item: z.boolean(),
  no_tax_reason: z.string().nullable(),
  phases_enabled: z.boolean(),
  show_phase_index: z.boolean(),
  phase_index_pattern: z.string(),
  show_phase_totals: z.boolean(),
  metadata_json: z.record(z.string(), z.unknown()),
  settings_json: z.record(z.string(), z.unknown()),
  sent_at: z.string().nullable(),
  internal_notes: z.string().nullable(),
  approved_at: z.string().nullable(),
  approved_by_name: z.string().nullable(),
  accepted_at: z.string().nullable(),
  project_id: z.string().nullable(),
  contract_signed_at: z.string().nullable(),
  contract_notes: z.string().nullable(),
  contract_file_path: z.string().nullable(),
  version_number: z.number().int().positive(),
  parent_offer_id: z.string().nullable(),
  billing_plan: offerBillingPlanSchema.nullable(),
  created_by: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const offerInputSchema = offerSchema
  .omit({
    id: true,
    tenant_id: true,
    scope_id: true,
    created_at: true,
    updated_at: true,
  })
  .extend({
    template_id: z.string().nullable().optional(),
    lead_id: z.string().nullable().optional(),
    sent_at: z.string().nullable().optional(),
    internal_notes: z.string().nullable().optional(),
    approved_at: z.string().nullable().optional(),
    approved_by_name: z.string().nullable().optional(),
    accepted_at: z.string().nullable().optional(),
    project_id: z.string().nullable().optional(),
    contract_signed_at: z.string().nullable().optional(),
    contract_notes: z.string().nullable().optional(),
    contract_file_path: z.string().nullable().optional(),
    version_number: z.number().int().positive().optional(),
    parent_offer_id: z.string().nullable().optional(),
    billing_plan: offerBillingPlanSchema.nullable().optional(),
  });

export const offerUpdateSchema = offerInputSchema.partial();

export const offerIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const offersListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(200).optional(),
  sortBy: z
    .enum([
      "title",
      "offer_number",
      "status",
      "offer_date",
      "valid_until",
      "created_at",
    ])
    .optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  search: z.string().optional(),
  status: offerStatusSchema.optional(),
  client_id: z.string().optional(),
});

export const offersPaginatedResponseSchema = z.object({
  data: z.array(offerSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});

export const offerVersionsResponseSchema = z.object({
  data: z.array(offerSchema),
});

export const offerBlockSchema = z.object({
  id: z.string(),
  offer_id: z.string(),
  tenant_id: z.string(),
  scope_id: z.string(),
  type: offerBlockTypeSchema,
  content_json: z.record(z.string(), z.unknown()),
  order_index: z.number().int().nonnegative(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const offerBlockInputSchema = offerBlockSchema.omit({
  tenant_id: true,
  scope_id: true,
  created_at: true,
  updated_at: true,
});

export const offerBlocksReplaceSchema = z.object({
  blocks: z.array(offerBlockInputSchema),
});

export const offerBlocksResponseSchema = z.object({
  data: z.array(offerBlockSchema),
});

export const offerTemplateSchema = z.object({
  id: z.string(),
  tenant_id: z.string(),
  scope_id: z.string(),
  module_key: z.literal("offers").optional(),
  name: z.string().min(1),
  is_default: z.boolean(),
  schema_version: z.number().int().positive().optional(),
  settings_json: z.record(z.string(), z.unknown()).optional(),
  document_id: z.string().optional(),
  document_key: z.string().optional(),
  engine: z.literal("xml_liquid_v1").optional(),
  document_template: z.string().optional(),
  stylesheet_template: z.string().optional(),
  input_schema_json: z.record(z.string(), z.unknown()).nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const offerTemplatesResponseSchema = z.object({
  data: z.array(offerTemplateSchema),
});

export const offerTemplateResponseSchema = z.object({
  data: offerTemplateSchema,
});

export const offerTemplateSetDefaultSchema = z.object({
  templateId: z.string().min(1),
});

export const offerSettingsSchema = z.object({
  offer_id_prefix: z.string().min(1),
  offer_id_offset: z.number().int().nonnegative(),
  offer_id_postfix: z.string(),
  default_intro: z.string(),
  default_final_notes: z.string(),
  valid_until_days: z.number().int().positive(),
});

export const offerSettingsInputSchema = offerSettingsSchema.partial();

export const offerNumberCheckQuerySchema = z.object({
  value: z.string().min(1),
  excludeId: z.string().min(1).optional(),
});

export const offerNumberCheckResponseSchema = z.object({
  available: z.boolean(),
});

export const offerNumberNextResponseSchema = z.object({
  offer_number: z.string().min(1),
});

export const notFoundSchema = z.object({
  error: z.string(),
});

export const deleteOfferResponseSchema = z.object({
  ok: z.literal(true),
  id: z.string(),
});
