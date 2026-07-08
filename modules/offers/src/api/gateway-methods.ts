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

/** Blocks input for agents: omit `id` for new blocks (generated on write). */
const offerAgentBlockInputSchema = offerBlockInputSchema
  .omit({ id: true, offer_id: true })
  .extend({ id: z.string().optional() });

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
 * {@link normalizeAgentBlock}; untouched blocks pass through verbatim.
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
    const normalized = normalizeAgentBlock({
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

/**
 * Normalize an agent-written block to the CANONICAL shape the editor, PDF
 * templates, and phase grouping actually read (verified against
 * ItemBlockRow/HeadlineBlock/TextBlock and the PDF provider's sample data):
 *
 * - line_item:  { title, amount, unit, cost_per_item, tax, content? }
 * - headline:   { title, content?, is_phase? } — a PHASE is a headline block
 *               with `is_phase: true` (there is no rendered "phase" type!)
 * - subheading: { title }
 * - text:       { content }
 *
 * Models overwhelmingly guess `quantity`/`unit_price`/`tax_rate`, `text`, and
 * a literal `type: "phase"` — all of which stored fine but rendered as 0 or
 * not at all. Accept the intuitive shapes here and convert, dropping aliases
 * so a later manual edit in the editor cannot diverge from a stale copy.
 */
export function normalizeAgentBlock(input: {
  content: Record<string, unknown>;
  type: string;
}): { content: Record<string, unknown>; type: string } {
  const next: Record<string, unknown> = { ...input.content };
  if (input.type === "line_item") {
    if (next.amount == null && next.quantity != null) {
      next.amount = next.quantity;
    }
    if (next.cost_per_item == null && next.unit_price != null) {
      next.cost_per_item = next.unit_price;
    }
    if (next.cost_per_item == null && next.price != null) {
      next.cost_per_item = next.price;
    }
    if (next.tax == null && next.tax_rate != null) {
      next.tax = next.tax_rate;
    }
    // Optional secondary description line renders from `content`.
    if (
      typeof next.content !== "string" &&
      typeof next.description === "string"
    ) {
      next.content = next.description;
    }
    const {
      description: _description,
      quantity: _quantity,
      unit_price: _unit_price,
      price: _price,
      tax_rate: _tax_rate,
      ...content
    } = next;
    return { content, type: input.type };
  }
  if (
    input.type === "phase" ||
    input.type === "headline" ||
    input.type === "subheading"
  ) {
    let content: Record<string, unknown> = next;
    if (
      (typeof content.title !== "string" || content.title.length === 0) &&
      typeof content.text === "string"
    ) {
      const { text, ...rest } = content;
      content = { ...rest, title: text };
    }
    if (input.type === "phase") {
      return { content: { ...content, is_phase: true }, type: "headline" };
    }
    return { content, type: input.type };
  }
  if (input.type === "text") {
    let content: Record<string, unknown> = next;
    if (typeof content.content !== "string" || content.content.length === 0) {
      if (typeof content.text === "string" && content.text.length > 0) {
        const { text, ...rest } = content;
        content = { ...rest, content: text };
      } else if (
        typeof content.title === "string" &&
        content.title.length > 0
      ) {
        const { title, ...rest } = content;
        content = { ...rest, content: title };
      }
    }
    return { content, type: input.type };
  }
  return { content: next, type: input.type };
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
      blocks: z
        .array(offerAgentBlockInputSchema)
        .describe(
          'Full ordered block list. content_json by type — line_item: {"title": string, "amount": number (quantity), "unit": string ("h", "Tage", "fixed", …), "cost_per_item": number (net unit price), "tax": number (percent), "content"?: string (description line)}; phase: {"title": string} (stored as a headline block with is_phase: true; groups all following blocks until the next phase); headline/subheading: {"title": string}; text: {"content": string}. The aliases quantity/unit_price/tax_rate and text are accepted and normalized to the canonical keys.'
        ),
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
        parsed.blocks.map((block, index) => {
          const normalized = normalizeAgentBlock({
            content: block.content_json ?? {},
            type: block.type,
          });
          return {
            id: block.id ?? "",
            offer_id: parsed.id,
            type: normalized.type as typeof block.type,
            content_json: normalized.content,
            order_index: block.order_index ?? index,
          };
        })
      );
    },
  });

  api.registerOperation({
    operationId: "offers_update_blocks",
    summary:
      "Partially edit offer blocks by id (update/insert/delete without resending the full list)",
    moduleId: "offers",
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
