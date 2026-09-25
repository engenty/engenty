// Agent-facing module operations for offers. HTTP routes (index.ts) serve the
// UI; these registered operations are what `engenty_tools_search` /
// `engenty_tool_execute` can discover and run — the offers.manager skills
// (offers-search-and-retrieve, offers-create-and-edit,
// offers-blocks-management) are written against exactly this surface.
import { normalizeCommercialBlock } from "@engenty/commercial-editor/blocks";
import {
  actorUserIdFromAuth,
  createPluginServerGatewayCaller,
  createRecordLinker,
  type PluginAuthContext,
  type PluginServerApi,
  type RecordLinkAuth,
  withRecordLink,
  withRecordLinks,
} from "@engenty/plugin-sdk";
import { z } from "@hono/zod-openapi";
import type { createOfferRepoSupabase } from "../dal/supabase.js";
import type { OfferCreateInput } from "../schema/types.js";
import {
  offerBlockInputSchema,
  offerBlockSchema,
  offerIdParamsSchema,
  offerSchema,
  offerSettingsInputSchema,
  offerSettingsSchema,
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

/**
 * Blocks input for agents: omit `id` for new blocks (generated on write), and
 * omit `order_index` to take the position the list itself gives.
 */
const offerAgentBlockInputSchema = offerBlockInputSchema
  .omit({ id: true, offer_id: true })
  .extend({ id: z.string().optional(), order_index: z.number().optional() });

/**
 * How a block list is written, shared by `offers_create` and
 * `offers_replace_blocks` so an agent learns the shape once.
 */
const OFFER_BLOCKS_DESCRIPTION =
  'Full ordered block list. content_json by type — line_item: {"title": string, "amount": number (quantity), "unit": string ("h", "Tage", "fixed", …), "cost_per_item": number (net unit price), "tax": number (percent), "content"?: string (description line)}; phase: {"title": string} (stored as a headline block with is_phase: true; groups all following blocks until the next phase); headline/subheading: {"title": string}; text: {"content": string}. The aliases quantity/unit_price/tax_rate and text are accepted and normalized to the canonical keys.';

/** Normalize an agent block list into the repo's replace input. */
function toReplaceBlocks(
  offerId: string,
  blocks: readonly z.infer<typeof offerAgentBlockInputSchema>[]
) {
  return blocks.map((block, index) => {
    const normalized = normalizeCommercialBlock({
      content: block.content_json ?? {},
      type: block.type,
    });
    return {
      id: block.id ?? "",
      offer_id: offerId,
      type: normalized.type as typeof block.type,
      content_json: normalized.content,
      order_index: block.order_index ?? index,
    };
  });
}

/**
 * What `offers_create` accepts: the offer fields plus, optionally, the
 * positions to write with it — one call for "an offer with its line items",
 * so a caller never has to plumb the new id into a second write.
 */
const offerAgentCreateWithBlocksSchema = offerAgentCreateSchema.extend({
  blocks: z
    .array(offerAgentBlockInputSchema)
    .optional()
    .describe(OFFER_BLOCKS_DESCRIPTION),
});

/** Diff-style upsert entry: position via `order_index` or `after_id`. */
const offerAgentBlockUpsertSchema = offerAgentBlockInputSchema.extend({
  after_id: z.string().nullable().optional(),
  order_index: z.number().int().optional(),
});

export interface OfferBlockEditEntry {
  content_json: Record<string, unknown>;
  id: string;
  offer_id: string;
  order_index: number;
  type: string;
}

/**
 * Pure diff application for `offers_update_blocks`: delete by id, update
 * matching ids in place (position preserved unless repositioned), insert new
 * blocks (append by default, or position via `order_index` / `after_id`,
 * `after_id: null` = at the top). Upserted content goes through
 * {@link normalizeCommercialBlock}; untouched blocks pass through verbatim.
 */
export function applyOfferBlockEdits(
  offerId: string,
  current: readonly OfferBlockEditEntry[],
  edits: {
    delete?: string[];
    upsert?: Array<
      {
        after_id?: string | null;
        content_json?: Record<string, unknown>;
        id?: string;
        order_index?: number;
        type: string;
      } & Record<string, unknown>
    >;
  }
): OfferBlockEditEntry[] {
  const deleteIds = new Set(edits.delete ?? []);
  const next: OfferBlockEditEntry[] = current
    .filter((block) => !deleteIds.has(block.id))
    .map((block) => ({ ...block, offer_id: offerId }));

  for (const up of edits.upsert ?? []) {
    const normalized = normalizeCommercialBlock({
      content: up.content_json ?? {},
      type: up.type,
    });
    const existingIdx = up.id ? next.findIndex((b) => b.id === up.id) : -1;
    const entry: OfferBlockEditEntry = {
      id: up.id ?? "",
      offer_id: offerId,
      type: normalized.type,
      content_json: normalized.content,
      order_index: existingIdx >= 0 ? next[existingIdx]!.order_index : 0,
    };
    let idx: number;
    if (existingIdx >= 0) {
      next[existingIdx] = entry;
      idx = existingIdx;
    } else {
      next.push(entry);
      idx = next.length - 1;
    }
    const wantsReposition = up.after_id !== undefined || up.order_index != null;
    if (wantsReposition) {
      const [moved] = next.splice(idx, 1);
      let insertAt: number;
      if (up.after_id === undefined) {
        insertAt = Math.min(Math.max(up.order_index ?? 0, 0), next.length);
      } else if (up.after_id === null) {
        insertAt = 0;
      } else {
        const anchor = next.findIndex((b) => b.id === up.after_id);
        insertAt = anchor >= 0 ? anchor + 1 : next.length;
      }
      next.splice(insertAt, 0, moved!);
    }
  }

  return next.map((block, index) => ({ ...block, order_index: index }));
}

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
    "callGatewayMethod" | "getTenantDb" | "hasOperation" | "registerOperation"
  >,
  repoOrFactory: RepoOrFactory,
  getRepo: GetRepoFn
) {
  const ops = createPluginServerGatewayCaller(api as PluginServerApi);
  // Offers are tenant-shared: the link lands in the space the call runs in.
  const link = createRecordLinker(api);
  const offerLink = (auth: RecordLinkAuth | undefined, offer: { id: string }) =>
    link(auth, "offers", [offer.id]);

  api.registerOperation({
    operationId: "offers_list",
    summary: "List offers (status filter, search, pagination)",
    moduleId: "offers",
    spacePolicy: { kind: "tenant_shared" },
    requiredCapabilities: ["module.offers.read"],
    riskLevel: "low",
    idempotent: true,
    inputSchema: offersListQuerySchema.partial(),
    outputSchema: offersPaginatedResponseSchema,
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const parsed = offersListQuerySchema.parse(input ?? {});
      const result = await repo.listPaginated(parsed);
      return {
        ...result,
        data: await withRecordLinks(result.data, (offer) =>
          offerLink(ctx.auth, offer)
        ),
      };
    },
  });

  api.registerOperation({
    operationId: "offers_get",
    summary: "Get offer by ID or offer number",
    moduleId: "offers",
    spacePolicy: { kind: "tenant_shared" },
    requiredCapabilities: ["module.offers.read"],
    riskLevel: "low",
    idempotent: true,
    inputSchema: offerIdParamsSchema,
    outputSchema: offerSchema.nullable(),
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const parsed = offerIdParamsSchema.parse(input);
      const offer =
        (await repo.getById(parsed.id)) ?? (await repo.getByNumber(parsed.id));
      return offer
        ? withRecordLink(offer, (row) => offerLink(ctx.auth, row))
        : offer;
    },
  });

  api.registerOperation({
    operationId: "offers_get_blocks",
    summary: "Get the content blocks of an offer (positions, phases, text)",
    moduleId: "offers",
    spacePolicy: { kind: "tenant_shared" },
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
    spacePolicy: { kind: "tenant_shared" },
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
    summary:
      "Create an offer, optionally with its positions (title suffices; UI defaults apply)",
    moduleId: "offers",
    spacePolicy: { kind: "tenant_shared" },
    requiredCapabilities: ["module.offers.write"],
    // A draft changes nothing the customer sees; approving or sending one
    // (offers_set_status) is the high-risk step that asks a person.
    riskLevel: "medium",
    inputSchema: offerAgentCreateWithBlocksSchema,
    outputSchema: offerSchema,
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const parsed = offerAgentCreateWithBlocksSchema.parse(input);
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
        created_by: actorUserIdFromAuth(ctx.auth),
      };
      const created = await repo.create(createInput);
      if (parsed.blocks && parsed.blocks.length > 0) {
        await repo.replaceBlocks(
          created.id,
          toReplaceBlocks(created.id, parsed.blocks)
        );
      }
      await ensureClientRoleOnEntity(ops, parsed.client_id, ctx.auth);
      return withRecordLink(created, (offer) => offerLink(ctx.auth, offer));
    },
  });

  api.registerOperation({
    operationId: "offers_update",
    summary: "Update offer fields (metadata, intro/notes, display toggles)",
    moduleId: "offers",
    spacePolicy: { kind: "tenant_shared" },
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
      return updated
        ? withRecordLink(updated, (offer) => offerLink(ctx.auth, offer))
        : updated;
    },
  });

  api.registerOperation({
    operationId: "offers_set_status",
    summary: "Transition offer status (draft → ready → accepted)",
    moduleId: "offers",
    spacePolicy: { kind: "tenant_shared" },
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
    spacePolicy: { kind: "tenant_shared" },
    requiredCapabilities: ["module.offers.write"],
    riskLevel: "high",
    requiresApproval: true,
    inputSchema: z.object({
      id: z.string().min(1),
      blocks: z
        .array(offerAgentBlockInputSchema)
        .describe(OFFER_BLOCKS_DESCRIPTION),
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
        toReplaceBlocks(parsed.id, parsed.blocks)
      );
    },
  });

  api.registerOperation({
    operationId: "offers_update_blocks",
    summary:
      "Partially edit offer blocks by id (update/insert/delete without resending the full list)",
    moduleId: "offers",
    spacePolicy: { kind: "tenant_shared" },
    requiredCapabilities: ["module.offers.write"],
    riskLevel: "high",
    requiresApproval: true,
    inputSchema: z.object({
      id: z.string().min(1),
      delete: z.array(z.string()).optional().describe("Block ids to remove."),
      upsert: z
        .array(offerAgentBlockUpsertSchema)
        .optional()
        .describe(
          'Blocks to update (id matches an existing block; position kept) or insert (no id; appended). Reposition/insert placement via "order_index" or "after_id" (null = at the top). content_json schema per type: see offers_replace_blocks.'
        ),
    }),
    outputSchema: z.array(offerBlockSchema),
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      const parsed = input as {
        delete?: string[];
        id: string;
        upsert?: z.infer<typeof offerAgentBlockUpsertSchema>[];
      };
      const current = await repo.listBlocks(parsed.id);
      const next = applyOfferBlockEdits(parsed.id, current, {
        delete: parsed.delete,
        upsert: parsed.upsert,
      });
      return repo.replaceBlocks(
        parsed.id,
        next.map((block) => ({
          ...block,
          type: block.type as (typeof current)[number]["type"],
        }))
      );
    },
  });

  api.registerOperation({
    operationId: "offers_settings_get",
    summary:
      "Get offer module settings (number format, defaults, validity days)",
    moduleId: "offers",
    spacePolicy: { kind: "tenant_shared" },
    requiredCapabilities: ["module.offers.read"],
    riskLevel: "low",
    idempotent: true,
    inputSchema: z.object({}),
    outputSchema: offerSettingsSchema,
    handler: async (_input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      return repo.getSettings();
    },
  });

  api.registerOperation({
    operationId: "offers_settings_set",
    summary:
      "Update offer module settings (partial: offer_id_prefix/offset/postfix, default_intro, default_final_notes, valid_until_days)",
    moduleId: "offers",
    spacePolicy: { kind: "tenant_shared" },
    requiredCapabilities: ["module.offers.write"],
    riskLevel: "high",
    requiresApproval: true,
    inputSchema: offerSettingsInputSchema,
    outputSchema: offerSettingsSchema,
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth);
      return repo.setSettings(offerSettingsInputSchema.parse(input ?? {}));
    },
  });

  api.registerOperation({
    operationId: "offers_delete",
    summary: "Delete an offer (irreversible)",
    moduleId: "offers",
    spacePolicy: { kind: "tenant_shared" },
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
