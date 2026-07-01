import type { SupabaseClient } from "@supabase/supabase-js";
import { uuidv7 } from "uuidv7";
import type {
  Faq,
  FaqInput,
  FaqSortColumn,
  FaqsQueryParams,
  FaqUpdateInput,
  PaginatedResponse,
} from "../schema/types.js";
import type { FaqActorContext, FaqRepo } from "./contracts.js";
import type { KbVersionRepo } from "./kb-versions.js";
import { getTagsForIds, rowToFaq, SCHEMA } from "./shared.js";

export function createFaqRepo(
  supabase: SupabaseClient,
  tenantId: string,
  scopeId: string,
  versions: KbVersionRepo
): FaqRepo {
  const kbs = () => supabase.schema(SCHEMA).from("knowledge_bases");
  const tagsTable = () => supabase.schema(SCHEMA).from("tags");
  const arts = () => supabase.schema(SCHEMA).from("articles");
  const artTags = () => supabase.schema(SCHEMA).from("article_tags");
  const atts = () => supabase.schema(SCHEMA).from("attachments");
  const faqsTable = () => supabase.schema(SCHEMA).from("faqs");
  const faqTagsTable = () => supabase.schema(SCHEMA).from("faq_tags");

  const faqs: FaqRepo = {
    async create(
      input: FaqInput,
      tagIds?: string[],
      actor?: FaqActorContext | null
    ): Promise<Faq> {
      const id = uuidv7();
      const now = new Date().toISOString();
      const principal = actor?.principalId?.trim() ?? null;
      const { data, error } = await faqsTable()
        .insert({
          id,
          tenant_id: tenantId,
          scope_id: scopeId,
          kb_id: input.kb_id,
          question: input.question,
          answer_json: input.answer_json ?? null,
          answer_markdown: input.answer_markdown ?? null,
          sort_order: input.sort_order ?? 0,
          status: input.status ?? "draft",
          created_at: now,
          updated_at: now,
        })
        .select()
        .single();
      if (error) {
        throw new Error(`Failed to create FAQ: ${error.message}`);
      }

      if (tagIds && tagIds.length > 0) {
        await faqTagsTable().insert(
          tagIds.map((tid) => ({ faq_id: id, tag_id: tid }))
        );
      }

      const tagsMap = await getTagsForIds(
        supabase,
        tenantId,
        "faq_tags",
        "faq_id",
        [id]
      );
      const faq = rowToFaq(
        data as Record<string, unknown>,
        tagsMap.get(id) ?? []
      );
      await versions.recordFaqVersion(faq, principal);
      return faq;
    },

    async listPaginated(
      params: FaqsQueryParams
    ): Promise<PaginatedResponse<Faq>> {
      const page = Math.max(params.page ?? 1, 1);
      const pageSize = Math.min(Math.max(params.page_size ?? 25, 1), 200);
      const sortAllow: Record<string, FaqSortColumn> = {
        question: "question",
        created_at: "created_at",
        updated_at: "updated_at",
        sort_order: "sort_order",
        status: "status",
      };
      const requested = params.sort_by ?? "sort_order";
      const sortBy: FaqSortColumn = sortAllow[requested] ?? "sort_order";
      const ascending = (params.sort_order ?? "asc") === "asc";

      let query = faqsTable()
        .select("*", { count: "exact", head: false })
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("kb_id", params.kb_id)
        .is("deleted_at", null);

      if (params.status) {
        query = query.eq("status", params.status);
      }
      if (params.search?.trim()) {
        const s = `%${params.search.trim()}%`;
        query = query.or(`question.ilike.${s},answer_markdown.ilike.${s}`);
      }

      const { data, error, count } = await query
        .order(sortBy, { ascending })
        .range((page - 1) * pageSize, page * pageSize - 1);

      if (error) {
        throw new Error(`Failed to list FAQs: ${error.message}`);
      }

      const items = (data ?? []).map((r) =>
        rowToFaq(r as Record<string, unknown>)
      );

      const ids = items.map((f) => f.id);
      const tagsMap = await getTagsForIds(
        supabase,
        tenantId,
        "faq_tags",
        "faq_id",
        ids
      );
      for (const item of items) {
        item.tags = tagsMap.get(item.id) ?? [];
      }

      return { data: items, total: count ?? 0, page, page_size: pageSize };
    },

    async getById(id: string): Promise<Faq | null> {
      const { data, error } = await faqsTable()
        .select("*")
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .single();
      if (error || !data) {
        return null;
      }

      const tagsMap = await getTagsForIds(
        supabase,
        tenantId,
        "faq_tags",
        "faq_id",
        [id]
      );
      return rowToFaq(data as Record<string, unknown>, tagsMap.get(id) ?? []);
    },

    async update(
      id: string,
      input: FaqUpdateInput,
      tagIds?: string[],
      actor?: FaqActorContext | null
    ): Promise<Faq | null> {
      const { data, error } = await faqsTable()
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .select()
        .single();
      if (error || !data) {
        return null;
      }

      if (tagIds !== undefined) {
        await this.setTags(id, tagIds);
      }

      const tagsMap = await getTagsForIds(
        supabase,
        tenantId,
        "faq_tags",
        "faq_id",
        [id]
      );
      const faq = rowToFaq(
        data as Record<string, unknown>,
        tagsMap.get(id) ?? []
      );
      await versions.recordFaqVersion(faq, actor?.principalId?.trim() ?? null);
      return faq;
    },

    async delete(id: string): Promise<boolean> {
      const { error } = await faqsTable()
        .update({
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("tenant_id", tenantId);
      return !error;
    },

    async setTags(faqId: string, tagIds: string[]): Promise<void> {
      await faqTagsTable().delete().eq("faq_id", faqId);
      if (tagIds.length > 0) {
        await faqTagsTable().insert(
          tagIds.map((tid) => ({ faq_id: faqId, tag_id: tid }))
        );
      }
    },
  };
  return faqs;
}
