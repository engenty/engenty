// Agent-facing module operations for offers. HTTP routes (index.ts) serve the
// UI; these registered operations are what `engenty_tools_search` /
// `engenty_tool_execute` can discover and run — the offers.manager skills
// (offers-search-and-retrieve, offers-create-and-edit,
// offers-blocks-management) are written against exactly this surface.
import {
  createPluginServerGatewayCaller,
  type PluginAuthContext,
  type PluginServerApi,
} from "@engenty/plugin-sdk";
import { z } from "@hono/zod-openapi";
import type { createOfferRepoSupabase } from "../dal/supabase.js";
import type { OfferCreateInput } from "../schema/types.js";
import {
  offerBlockInputSchema,
  offerBlockSchema,
  offerIdParamsSchema,
  offerSchema,
  offerStatusSchema,
  offersListQuerySchema,
  offersPaginatedResponseSchema,
  offerUpdateSchema,
} from "../schema/zod.js";

type OfferRepo = ReturnType<typeof createOfferRepoSupabase>;
type RepoOrFactory = OfferRepo | ((auth: PluginAuthContext) => OfferRepo);
type GetRepoFn = (
  repoOrFactory: RepoOrFactory,
  auth?: PluginAuthContext
) => OfferRepo;

/**
 * Agent-friendly create input: `title` is enough; everything else falls back
 * to the same defaults the UI's create flow applies
 * (see modules/offers/ui/lib/create-offer-payload.ts).
 */
const offerAgentCreateSchema = z.object({
  billing_interval: z
    .enum(["monthly", "quarterly", "yearly"])
    .nullable()
    .optional(),
  billing_type: z
    .enum(["fixed_price", "time_and_materials", "retainer", "recurring"])
    .optional(),
  client_id: z.string().nullable().optional(),
  currency: z.string().optional(),
  default_tax_rate: z.number().optional(),
  final_notes: z.string().nullable().optional(),
  introduction: z.string().nullable().optional(),
  offer_date: z.string().optional(),
  recipient_address: z.string().nullable().optional(),
  recipient_email: z.string().nullable().optional(),
  recipient_name: z.string().nullable().optional(),
  reference: z.string().nullable().optional(),
  title: z.string().min(1),
  valid_until: z.string().optional(),
});

/** Blocks input for agents: omit `id` for new blocks (generated on write). */
const offerAgentBlockInputSchema = offerBlockInputSchema
  .omit({ id: true, offer_id: true })
  .extend({ id: z.string().optional() });

const DEFAULT_TAX_RATE = 20;

async function resolveDefaultTaxRate(
  ops: ReturnType<typeof createPluginServerGatewayCaller>,
  auth?: PluginAuthContext
): Promise<number> {
  if (!ops.hasOperation("commercial_settings_get")) {
    return DEFAULT_TAX_RATE;
  }
  try {
    const settings = (await ops.invokeOperation(
      "commercial_settings_get",
      {},
      { auth }
    )) as { default_tax_rate?: unknown } | null;
    const rate = Number(settings?.default_tax_rate);
    return Number.isFinite(rate) ? rate : DEFAULT_TAX_RATE;
  } catch {
    return DEFAULT_TAX_RATE;
  }
}

async function ensureClientRoleOnEntity(
  ops: ReturnType<typeof createPluginServerGatewayCaller>,
  clientId: string | null | undefined,
  auth?: PluginAuthContext
): Promise<void> {
  const id = typeof clientId === "string" ? clientId.trim() : "";
  if (!(id && ops.hasOperation("contacts_add_contact_role"))) {
    return;
  }
  try {
    await ops.invokeOperation(
      "contacts_add_contact_role",
      { contactId: id, role: "client" },
      { auth }
    );
  } catch {
    // contacts plugin may not be loaded
  }
}

export function registerOffersGatewayMethods(
  api: Pick<
    PluginServerApi,
    "callGatewayMethod" | "hasOperation" | "registerOperation"
  >,
  repoOrFactory: RepoOrFactory,
  getRepo: GetRepoFn
) {
  const ops = createPluginServerGatewayCaller(api as PluginServerApi);

  api.registerOperation({
    operationId: "offers_list",
    summary: "List offers (status filter, search, pagination)",
    moduleId: "offers",
    requiredCapabilities: ["module.offers.read"],
    riskLevel: "low",
    idempotent: true,
    inputSchema: offersListQuerySchema.partial(),
    outputSchema: offersPaginatedResponseSchema,
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const parsed = offersListQuerySchema.parse(input ?? {});
      return repo.listPaginated(parsed);
    },
  });

  api.registerOperation({
    operationId: "offers_get",
    summary: "Get offer by ID or offer number",
    moduleId: "offers",
    requiredCapabilities: ["module.offers.read"],
    riskLevel: "low",
    idempotent: true,
    inputSchema: offerIdParamsSchema,
    outputSchema: offerSchema.nullable(),
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const parsed = offerIdParamsSchema.parse(input);
      return (
        (await repo.getById(parsed.id)) ?? (await repo.getByNumber(parsed.id))
      );
    },
  });

  api.registerOperation({
    operationId: "offers_get_blocks",
    summary: "Get the content blocks of an offer (positions, phases, text)",
    moduleId: "offers",
    requiredCapabilities: ["module.offers.read"],
    riskLevel: "low",
    idempotent: true,
    inputSchema: offerIdParamsSchema,
    outputSchema: z.array(offerBlockSchema),
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const parsed = offerIdParamsSchema.parse(input);
      return repo.listBlocks(parsed.id);
    },
  });

  api.registerOperation({
    operationId: "offers_get_next_number",
    summary: "Preview the next offer number",
    moduleId: "offers",
    requiredCapabilities: ["module.offers.read"],
    riskLevel: "low",
    idempotent: true,
    inputSchema: z.object({}).passthrough(),
    outputSchema: z.object({ number: z.string() }),
    handler: async (_input, ctx) => ({
      number: await getRepo(repoOrFactory, ctx.auth).getNextOfferNumber(),
    }),
  });

  api.registerOperation({
    operationId: "offers_create",
    summary: "Create an offer (title suffices; UI defaults apply)",
    moduleId: "offers",
    requiredCapabilities: ["module.offers.write"],
    riskLevel: "high",
    requiresApproval: true,
    inputSchema: offerAgentCreateSchema,
    outputSchema: offerSchema,
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const parsed = offerAgentCreateSchema.parse(input);
      const settings = await repo.getSettings();
      const now = new Date();
      const validUntil = new Date(now);
      validUntil.setDate(validUntil.getDate() + settings.valid_until_days);
      const createInput: OfferCreateInput = {
        template_id: null,
        client_id: parsed.client_id ?? null,
        lead_id: null,
        title: parsed.title,
        // Always regenerated inside repo.create from the number settings.
        offer_number: "",
        status: "draft",
        reference: parsed.reference ?? null,
        offer_date: parsed.offer_date ?? now.toISOString().slice(0, 10),
        valid_until:
          parsed.valid_until ?? validUntil.toISOString().slice(0, 10),
        // null lets repo.create fall back to the module default texts.
        introduction: parsed.introduction ?? null,
        final_notes: parsed.final_notes ?? null,
        currency: parsed.currency ?? "EUR",
        recipient_name: parsed.recipient_name ?? null,
        recipient_address: parsed.recipient_address ?? null,
        recipient_email: parsed.recipient_email ?? null,
        recipient_custom_info: null,
        show_contact_name: true,
        show_contact_email: true,
        billing_type: parsed.billing_type ?? "fixed_price",
        billing_interval: parsed.billing_interval ?? null,
        retainer_amount: null,
        spillover_rules: null,
        allows_fixed_positions: false,
        usage_based: false,
        default_tax_rate:
          parsed.default_tax_rate ??
          (await resolveDefaultTaxRate(ops, ctx.auth)),
        show_tax_per_item: false,
        no_tax_reason: null,
        phases_enabled: true,
        show_phase_index: true,
        phase_index_pattern: "1.",
        show_phase_totals: false,
        metadata_json: {},
        settings_json: {},
        created_by: ctx.auth?.principalId ?? null,
      };
      const created = await repo.create(createInput);
      await ensureClientRoleOnEntity(ops, parsed.client_id, ctx.auth);
      return created;
    },
  });

  api.registerOperation({
    operationId: "offers_update",
    summary: "Update offer fields (metadata, intro/notes, display toggles)",
    moduleId: "offers",
    requiredCapabilities: ["module.offers.write"],
    riskLevel: "high",
    requiresApproval: true,
    inputSchema: z.object({
      id: z.string().min(1),
      patch: offerUpdateSchema,
    }),
    outputSchema: offerSchema.nullable(),
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const parsed = input as {
        id: string;
        patch: z.infer<typeof offerUpdateSchema>;
      };
      const updated = await repo.update(parsed.id, parsed.patch);
      await ensureClientRoleOnEntity(ops, parsed.patch.client_id, ctx.auth);
      return updated;
    },
  });

  api.registerOperation({
    operationId: "offers_set_status",
    summary: "Transition offer status (draft → ready → accepted)",
    moduleId: "offers",
    requiredCapabilities: ["module.offers.write"],
    riskLevel: "high",
    requiresApproval: true,
    inputSchema: z.object({
      id: z.string().min(1),
      status: offerStatusSchema,
    }),
    outputSchema: offerSchema.nullable(),
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const parsed = input as {
        id: string;
        status: z.infer<typeof offerStatusSchema>;
      };
      return repo.update(parsed.id, { status: parsed.status });
    },
  });

  api.registerOperation({
    operationId: "offers_replace_blocks",
    summary: "Replace all content blocks of an offer (atomic full write)",
    moduleId: "offers",
    requiredCapabilities: ["module.offers.write"],
    riskLevel: "high",
    requiresApproval: true,
    inputSchema: z.object({
      id: z.string().min(1),
      blocks: z.array(offerAgentBlockInputSchema),
    }),
    outputSchema: z.array(offerBlockSchema),
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const parsed = input as {
        id: string;
        blocks: z.infer<typeof offerAgentBlockInputSchema>[];
      };
      return repo.replaceBlocks(
        parsed.id,
        parsed.blocks.map((block, index) => ({
          id: block.id ?? "",
          offer_id: parsed.id,
          type: block.type,
          content_json: block.content_json,
          order_index: block.order_index ?? index,
        }))
      );
    },
  });

  api.registerOperation({
    operationId: "offers_delete",
    summary: "Delete an offer (irreversible)",
    moduleId: "offers",
    requiredCapabilities: ["module.offers.write"],
    riskLevel: "critical",
    requiresApproval: true,
    inputSchema: offerIdParamsSchema,
    outputSchema: z.object({ deleted: z.boolean() }),
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const parsed = offerIdParamsSchema.parse(input);
      const deleted = await repo.delete(parsed.id);
      return { deleted };
    },
  });
}
