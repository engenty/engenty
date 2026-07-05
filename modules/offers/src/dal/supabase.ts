import type { SupabaseClient } from "@supabase/supabase-js";
import { uuidv7 } from "uuidv7";
import type {
  Offer,
  OfferBillingPlan,
  OfferBlock,
  OfferBlockInput,
  OfferCreateInput,
  OfferSettings,
  OfferSettingsInput,
  OffersPaginatedResponse,
  OffersQueryParams,
  OfferTemplate,
  OfferUpdateInput,
} from "../schema/types.js";

const NUMERIC_ONLY_REGEX = /^\d+$/;

const DEFAULT_OFFER_SETTINGS: OfferSettings = {
  offer_id_prefix: "ang-{year}-",
  offer_id_offset: 1000,
  offer_id_postfix: "",
  default_intro: "",
  default_final_notes: "",
  valid_until_days: 30,
};

function formatOfferDisplayId(
  position: number,
  settings: Pick<
    OfferSettings,
    "offer_id_prefix" | "offer_id_offset" | "offer_id_postfix"
  >
): string {
  const formattedPrefix = settings.offer_id_prefix.replace(
    "{year}",
    new Date().getFullYear().toString()
  );
  const displayNumber = settings.offer_id_offset + position - 1;
  return `${formattedPrefix}${displayNumber}${settings.offer_id_postfix}`;
}

function formatOfferNumberFromDisplayNumber(
  displayNumber: number,
  settings: Pick<
    OfferSettings,
    "offer_id_prefix" | "offer_id_offset" | "offer_id_postfix"
  >
): string {
  const position = displayNumber - settings.offer_id_offset + 1;
  return formatOfferDisplayId(position, settings);
}

function parseOfferDisplayNumber(
  offerNumber: string,
  settings: Pick<OfferSettings, "offer_id_prefix" | "offer_id_postfix">
): number | null {
  const formattedPrefix = settings.offer_id_prefix.replace(
    "{year}",
    new Date().getFullYear().toString()
  );
  let numericPart = offerNumber;
  if (formattedPrefix && numericPart.startsWith(formattedPrefix)) {
    numericPart = numericPart.slice(formattedPrefix.length);
  }
  if (
    settings.offer_id_postfix &&
    numericPart.endsWith(settings.offer_id_postfix)
  ) {
    numericPart = numericPart.slice(0, -settings.offer_id_postfix.length);
  }
  if (!NUMERIC_ONLY_REGEX.test(numericPart)) {
    return null;
  }
  const parsed = Number.parseInt(numericPart, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseBillingPlan(raw: unknown): OfferBillingPlan | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const value = raw as Record<string, unknown>;
  if (!value.mode) {
    return null;
  }
  const milestones = Array.isArray(value.milestones) ? value.milestones : [];
  return {
    mode: value.mode as OfferBillingPlan["mode"],
    milestones: milestones.map((m) => {
      const e = m as Record<string, unknown>;
      return {
        description: String(e.description ?? ""),
        date: (e.date as string | null) ?? null,
        percent: Number(e.percent ?? 0),
      };
    }),
  };
}

function rowToOffer(row: Record<string, unknown>): Offer {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    scope_id: String(row.scope_id),
    template_id: (row.template_id as string | null) ?? null,
    client_id: (row.client_id as string | null) ?? null,
    lead_id: (row.lead_id as string | null) ?? null,
    internal_notes: (row.internal_notes as string | null) ?? null,
    approved_at: (row.approved_at as string | null) ?? null,
    approved_by_name: (row.approved_by_name as string | null) ?? null,
    accepted_at: (row.accepted_at as string | null) ?? null,
    project_id: (row.project_id as string | null) ?? null,
    contract_signed_at: (row.contract_signed_at as string | null) ?? null,
    contract_notes: (row.contract_notes as string | null) ?? null,
    contract_file_path: (row.contract_file_path as string | null) ?? null,
    version_number: Number(row.version_number ?? 1),
    parent_offer_id: (row.parent_offer_id as string | null) ?? null,
    billing_plan: parseBillingPlan(row.billing_plan),
    title: String(row.title ?? ""),
    offer_number: String(row.offer_number ?? ""),
    status: (row.status as Offer["status"]) ?? "draft",
    reference: (row.reference as string | null) ?? null,
    offer_date: (row.offer_date as string | null) ?? null,
    valid_until: (row.valid_until as string | null) ?? null,
    introduction: (row.introduction as string | null) ?? null,
    final_notes: (row.final_notes as string | null) ?? null,
    currency: String(row.currency ?? "EUR"),
    recipient_name: (row.recipient_name as string | null) ?? null,
    recipient_address: (row.recipient_address as string | null) ?? null,
    recipient_email: (row.recipient_email as string | null) ?? null,
    recipient_custom_info: (row.recipient_custom_info as string | null) ?? null,
    show_contact_name: Boolean(row.show_contact_name ?? true),
    show_contact_email: Boolean(row.show_contact_email ?? true),
    billing_type: (row.billing_type as Offer["billing_type"]) ?? "fixed_price",
    billing_interval:
      (row.billing_interval as Offer["billing_interval"]) ?? null,
    retainer_amount:
      row.retainer_amount == null ? null : Number(row.retainer_amount),
    spillover_rules: (row.spillover_rules as string | null) ?? null,
    allows_fixed_positions: Boolean(row.allows_fixed_positions ?? false),
    usage_based: Boolean(row.usage_based ?? false),
    default_tax_rate: Number(row.default_tax_rate ?? 20),
    show_tax_per_item: Boolean(row.show_tax_per_item ?? false),
    no_tax_reason: (row.no_tax_reason as string | null) ?? null,
    phases_enabled: Boolean(row.phases_enabled ?? false),
    show_phase_index: Boolean(row.show_phase_index ?? false),
    phase_index_pattern: String(row.phase_index_pattern ?? "1."),
    show_phase_totals: Boolean(row.show_phase_totals ?? false),
    metadata_json: (row.metadata_json as Record<string, unknown> | null) ?? {},
    settings_json: (row.settings_json as Record<string, unknown> | null) ?? {},
    sent_at: (row.sent_at as string | null) ?? null,
    created_by: (row.created_by as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function rowToOfferTemplate(row: Record<string, unknown>): OfferTemplate {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    scope_id: String(row.scope_id),
    module_key: "offers",
    name: String(row.name ?? ""),
    is_default: Boolean(row.is_default),
    schema_version: Number(row.schema_version ?? 1),
    settings_json:
      (row.settings_json as Record<string, unknown> | null) ?? undefined,
    document_id: (row.document_id as string | undefined) ?? undefined,
    document_key: (row.document_key as string | undefined) ?? undefined,
    engine: "xml_liquid_v1",
    document_template:
      (row.document_template as string | undefined) ?? undefined,
    stylesheet_template:
      (row.stylesheet_template as string | undefined) ?? undefined,
    input_schema_json:
      (row.input_schema_json as Record<string, unknown> | null | undefined) ??
      undefined,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function rowToOfferBlock(row: Record<string, unknown>): OfferBlock {
  return {
    id: String(row.id),
    offer_id: String(row.offer_id),
    tenant_id: String(row.tenant_id),
    scope_id: String(row.scope_id),
    type: row.type as OfferBlock["type"],
    content_json: (row.content_json as Record<string, unknown> | null) ?? {},
    order_index: Number(row.order_index ?? 0),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapSortBy(sortBy?: OffersQueryParams["sortBy"]): string {
  const sortColumnMap: Record<
    NonNullable<OffersQueryParams["sortBy"]>,
    string
  > = {
    title: "title",
    offer_number: "offer_number",
    status: "status",
    offer_date: "offer_date",
    valid_until: "valid_until",
    created_at: "created_at",
  };
  if (!sortBy) {
    return "updated_at";
  }
  return sortColumnMap[sortBy] ?? "updated_at";
}

export function createOfferRepoSupabase(
  adapter: unknown,
  tenantId: string,
  scopeId: string
) {
  const supabase = adapter as SupabaseClient;
  const schema = "module_offers";
  const pdfTemplateSchema = "module_pdf_templates";
  const offers = () => supabase.schema(schema).from("offers");
  const blocks = () => supabase.schema(schema).from("offer_blocks");
  const sharedTemplates = () =>
    supabase.schema(pdfTemplateSchema).from("templates");
  const settings = () => supabase.schema(schema).from("settings");

  return {
    async create(input: OfferCreateInput): Promise<Offer> {
      const now = new Date().toISOString();
      const id = uuidv7();
      const moduleSettings = await this.getSettings();
      let nextDisplayNumber =
        await this.getNextOfferDisplayNumber(moduleSettings);
      const maxAttempts = 10;

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const candidateOfferNumber = formatOfferNumberFromDisplayNumber(
          nextDisplayNumber,
          moduleSettings
        );
        const alreadyExists =
          await this.offerNumberExists(candidateOfferNumber);
        if (alreadyExists) {
          nextDisplayNumber += 1;
          continue;
        }

        const toInsert = {
          id,
          tenant_id: tenantId,
          scope_id: scopeId,
          template_id: input.template_id ?? null,
          ...input,
          offer_number: candidateOfferNumber,
          introduction:
            input.introduction ?? moduleSettings.default_intro ?? null,
          final_notes:
            input.final_notes ?? moduleSettings.default_final_notes ?? null,
          metadata_json: input.metadata_json ?? {},
          settings_json: input.settings_json ?? {},
          created_at: now,
          updated_at: now,
        };
        const { data, error } = await offers()
          .insert(toInsert)
          .select("*")
          .single();
        if (!error) {
          return rowToOffer((data as Record<string, unknown>) ?? toInsert);
        }

        const duplicateConflict =
          (error as { code?: string })?.code === "23505" ||
          error.message.includes("duplicate key value") ||
          error.message.includes("idx_module_offers_offer_number_unique");
        if (duplicateConflict) {
          nextDisplayNumber += 1;
          continue;
        }

        throw new Error(`Failed to create offer: ${error.message}`);
      }

      throw new Error("Failed to generate a unique offer number.");
    },

    async offerNumberExists(offerNumber: string): Promise<boolean> {
      const { data, error } = await offers()
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("offer_number", offerNumber)
        .is("deleted_at", null)
        .maybeSingle();
      if (error && (error as { code?: string })?.code !== "PGRST116") {
        throw new Error(
          `Failed to check existing offer number: ${error.message}`
        );
      }
      return Boolean(data);
    },

    async getNextOfferDisplayNumber(
      currentSettings?: OfferSettings
    ): Promise<number> {
      const settings = currentSettings ?? (await this.getSettings());
      const { data, error } = await offers()
        .select("offer_number")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .is("deleted_at", null);
      if (error) {
        throw new Error(
          `Failed to calculate next offer number: ${error.message}`
        );
      }

      const highestExistingNumber = (data ?? []).reduce((maxValue, row) => {
        const value = parseOfferDisplayNumber(
          String(row.offer_number ?? ""),
          settings
        );
        if (value == null) {
          return maxValue;
        }
        return Math.max(maxValue, value);
      }, settings.offer_id_offset - 1);

      const nextDisplayNumber = highestExistingNumber + 1;
      return nextDisplayNumber;
    },

    async getNextOfferNumber(currentSettings?: OfferSettings): Promise<string> {
      const settings = currentSettings ?? (await this.getSettings());
      const nextDisplayNumber = await this.getNextOfferDisplayNumber(settings);
      return formatOfferNumberFromDisplayNumber(nextDisplayNumber, settings);
    },

    async listPaginated(
      params: OffersQueryParams = {}
    ): Promise<OffersPaginatedResponse> {
      const page = Math.max(params.page ?? 1, 1);
      const pageSize = Math.min(Math.max(params.pageSize ?? 25, 1), 200);
      const sortBy = mapSortBy(params.sortBy);
      const ascending = params.sortOrder === "asc";
      let query = offers()
        .select("*", { count: "exact", head: false })
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .is("deleted_at", null);

      if (params.status) {
        query = query.eq("status", params.status);
      }
      if (params.client_id) {
        query = query.eq("client_id", params.client_id);
      }
      if (params.search?.trim()) {
        const search = `%${params.search.trim()}%`;
        query = query.or(
          `title.ilike.${search},offer_number.ilike.${search},reference.ilike.${search}`
        );
      }

      const { data, error, count } = await query
        .order(sortBy, { ascending })
        .range((page - 1) * pageSize, page * pageSize - 1);
      if (error) {
        throw new Error(`Failed to list offers: ${error.message}`);
      }

      return {
        data: (data ?? []).map((row) =>
          rowToOffer(row as Record<string, unknown>)
        ),
        total: count ?? 0,
        page,
        pageSize,
      };
    },

    async getById(id: string): Promise<Offer | null> {
      const { data, error } = await offers()
        .select("*")
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .is("deleted_at", null)
        .single();
      if (error || !data) {
        return null;
      }
      return rowToOffer(data as Record<string, unknown>);
    },

    async getByNumber(offerNumber: string): Promise<Offer | null> {
      const { data, error } = await offers()
        .select("*")
        .eq("offer_number", offerNumber)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .is("deleted_at", null)
        .single();
      if (error || !data) {
        return null;
      }
      return rowToOffer(data as Record<string, unknown>);
    },

    async update(id: string, patch: OfferUpdateInput): Promise<Offer | null> {
      const existing = await this.getById(id);
      if (!existing) {
        return null;
      }
      const now = new Date().toISOString();
      const nextPatch: Record<string, unknown> = {
        ...patch,
        updated_at: now,
      };
      // Stamp lifecycle transition timestamps the first time they occur.
      if (patch.status === "ready" && !existing.approved_at) {
        nextPatch.approved_at = now;
      }
      if (patch.status === "accepted" && !existing.accepted_at) {
        nextPatch.accepted_at = now;
      }
      const { data, error } = await offers()
        .update(nextPatch)
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .select("*")
        .single();
      if (error) {
        throw new Error(`Failed to update offer: ${error.message}`);
      }
      return rowToOffer(
        (data as Record<string, unknown>) ?? { ...existing, ...nextPatch }
      );
    },

    /** All offers in the version chain (root + descendants), newest version first. */
    async listVersions(id: string): Promise<Offer[]> {
      const current = await this.getById(id);
      if (!current) {
        return [];
      }
      const rootId = current.parent_offer_id ?? current.id;
      const { data, error } = await offers()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .is("deleted_at", null)
        .or(`id.eq.${rootId},parent_offer_id.eq.${rootId}`)
        .order("version_number", { ascending: false });
      if (error) {
        throw new Error(`Failed to list offer versions: ${error.message}`);
      }
      return (data ?? []).map((row) =>
        rowToOffer(row as Record<string, unknown>)
      );
    },

    /** Duplicate an offer (and its blocks) as a new draft version in the chain. */
    async duplicateAsNewVersion(id: string): Promise<Offer | null> {
      const source = await this.getById(id);
      if (!source) {
        return null;
      }
      const rootId = source.parent_offer_id ?? source.id;
      const versions = await this.listVersions(id);
      const nextVersion =
        versions.reduce((max, v) => Math.max(max, v.version_number), 0) + 1;
      const now = new Date().toISOString();
      const newId = uuidv7();
      const moduleSettings = await this.getSettings();
      const offerNumber = await this.getNextOfferNumber(moduleSettings);

      const {
        id: _id,
        tenant_id: _t,
        scope_id: _s,
        created_at: _c,
        updated_at: _u,
        status: _status,
        sent_at: _sent,
        approved_at: _appr,
        approved_by_name: _apprBy,
        accepted_at: _acc,
        contract_signed_at: _csig,
        contract_notes: _cnotes,
        contract_file_path: _cfile,
        project_id: _proj,
        billing_plan: _bp,
        version_number: _vn,
        parent_offer_id: _pid,
        offer_number: _on,
        ...rest
      } = source;

      const toInsert = {
        ...rest,
        id: newId,
        tenant_id: tenantId,
        scope_id: scopeId,
        offer_number: offerNumber,
        status: "draft" as const,
        version_number: nextVersion,
        parent_offer_id: rootId,
        created_at: now,
        updated_at: now,
      };
      const { error } = await offers().insert(toInsert);
      if (error) {
        throw new Error(`Failed to create offer version: ${error.message}`);
      }

      const sourceBlocks = await this.listBlocks(source.id);
      if (sourceBlocks.length > 0) {
        await this.replaceBlocks(
          newId,
          sourceBlocks.map((b) => ({
            id: uuidv7(),
            offer_id: newId,
            type: b.type,
            content_json: b.content_json,
            order_index: b.order_index,
          }))
        );
      }
      return this.getById(newId);
    },

    async delete(id: string): Promise<boolean> {
      const existing = await this.getById(id);
      if (!existing) {
        return false;
      }
      const { error } = await offers()
        .update({
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId);
      if (error) {
        throw new Error(`Failed to delete offer: ${error.message}`);
      }
      return true;
    },

    async listBlocks(offerId: string): Promise<OfferBlock[]> {
      const { data, error } = await blocks()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("offer_id", offerId)
        .order("order_index", { ascending: true });
      if (error) {
        throw new Error(`Failed to list offer blocks: ${error.message}`);
      }
      return (data ?? []).map((row) =>
        rowToOfferBlock(row as Record<string, unknown>)
      );
    },

    async replaceBlocks(
      offerId: string,
      nextBlocks: OfferBlockInput[]
    ): Promise<OfferBlock[]> {
      const { error: deleteError } = await blocks()
        .delete()
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("offer_id", offerId);
      if (deleteError) {
        throw new Error(
          `Failed to replace offer blocks: ${deleteError.message}`
        );
      }

      if (nextBlocks.length === 0) {
        return [];
      }
      const now = new Date().toISOString();
      const payload = nextBlocks.map((block, index) => ({
        id: block.id || uuidv7(),
        tenant_id: tenantId,
        scope_id: scopeId,
        offer_id: offerId,
        type: block.type,
        content_json: block.content_json ?? {},
        order_index: Number.isFinite(block.order_index)
          ? block.order_index
          : index,
        created_at: now,
        updated_at: now,
      }));
      const { data, error } = await blocks()
        .insert(payload)
        .select("*")
        .order("order_index", { ascending: true });
      if (error) {
        throw new Error(`Failed to insert offer blocks: ${error.message}`);
      }
      return (data ?? []).map((row) =>
        rowToOfferBlock(row as Record<string, unknown>)
      );
    },

    async listTemplates(): Promise<OfferTemplate[]> {
      const { data, error } = await sharedTemplates()
        .select(
          "id,tenant_id,scope_id,module_key,name,is_default,schema_version,settings_json,created_at,updated_at"
        )
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("module_key", "offers")
        .is("deleted_at", null)
        .order("is_default", { ascending: false })
        .order("name", { ascending: true });
      if (error) {
        throw new Error(`Failed to list offer templates: ${error.message}`);
      }
      return (data ?? []).map((row) =>
        rowToOfferTemplate(row as Record<string, unknown>)
      );
    },

    async setDefaultTemplate(
      templateId: string
    ): Promise<OfferTemplate | null> {
      const { data: existingTemplate, error: existingError } =
        await sharedTemplates()
          .select(
            "id,tenant_id,scope_id,module_key,name,is_default,schema_version,settings_json,created_at,updated_at"
          )
          .eq("id", templateId)
          .eq("tenant_id", tenantId)
          .eq("scope_id", scopeId)
          .eq("module_key", "offers")
          .is("deleted_at", null)
          .single();
      if (existingError || !existingTemplate) {
        return null;
      }

      const now = new Date().toISOString();
      const { error: clearError } = await sharedTemplates()
        .update({ is_default: false, updated_at: now })
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("module_key", "offers")
        .eq("is_default", true)
        .is("deleted_at", null);
      if (clearError) {
        throw new Error(
          `Failed to clear default offer template: ${clearError.message}`
        );
      }

      const { data, error } = await sharedTemplates()
        .update({ is_default: true, updated_at: now })
        .eq("id", templateId)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("module_key", "offers")
        .select(
          "id,tenant_id,scope_id,module_key,name,is_default,schema_version,settings_json,created_at,updated_at"
        )
        .single();
      if (error) {
        throw new Error(
          `Failed to set default offer template: ${error.message}`
        );
      }
      return rowToOfferTemplate(
        (data as Record<string, unknown>) ?? existingTemplate
      );
    },

    async getSettings(): Promise<OfferSettings> {
      const { data, error } = await settings()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .single();
      if (error || !data) {
        return { ...DEFAULT_OFFER_SETTINGS };
      }
      const row = data as Record<string, unknown>;
      return {
        offer_id_prefix: String(
          row.offer_id_prefix ?? DEFAULT_OFFER_SETTINGS.offer_id_prefix
        ),
        offer_id_offset: Number(
          row.offer_id_offset ?? DEFAULT_OFFER_SETTINGS.offer_id_offset
        ),
        offer_id_postfix: String(
          row.offer_id_postfix ?? DEFAULT_OFFER_SETTINGS.offer_id_postfix
        ),
        default_intro: String(
          row.default_intro ?? DEFAULT_OFFER_SETTINGS.default_intro
        ),
        default_final_notes: String(
          row.default_final_notes ?? DEFAULT_OFFER_SETTINGS.default_final_notes
        ),
        valid_until_days: Number(
          row.valid_until_days ?? DEFAULT_OFFER_SETTINGS.valid_until_days
        ),
      };
    },

    async setSettings(input: OfferSettingsInput): Promise<OfferSettings> {
      const current = await this.getSettings();
      const merged: OfferSettings = {
        ...current,
        ...input,
      };
      const { error } = await settings().upsert(
        {
          tenant_id: tenantId,
          scope_id: scopeId,
          offer_id_prefix: merged.offer_id_prefix,
          offer_id_offset: merged.offer_id_offset,
          offer_id_postfix: merged.offer_id_postfix,
          default_intro: merged.default_intro,
          default_final_notes: merged.default_final_notes,
          valid_until_days: merged.valid_until_days,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id,scope_id" }
      );
      if (error) {
        throw new Error(`Failed to update offer settings: ${error.message}`);
      }
      return merged;
    },
  };
}
