import { createLogger } from "@engenty/telemetry";
import type { SupabaseClient } from "@supabase/supabase-js";
import { uuidv7 } from "uuidv7";
import type {
  Article,
  Faq,
  KbVersionDetail,
  KbVersionSummary,
} from "../schema/types.js";
import {
  articleToVersionSnapshot,
  faqToVersionSnapshot,
} from "../services/kb-version-snapshots.js";
import { SCHEMA } from "./shared.js";

const logger = createLogger({ name: "kb-versions" });

async function nextVersion(
  supabase: SupabaseClient,
  table: "article_versions" | "faq_versions",
  fkColumn: "article_id" | "faq_id",
  fkValue: string,
  tenantId: string,
  scopeId: string
): Promise<number> {
  const t = supabase.schema(SCHEMA).from(table);
  const { data, error } = await t
    .select("version")
    .eq(fkColumn, fkValue)
    .eq("tenant_id", tenantId)
    .eq("scope_id", scopeId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to resolve next version: ${error.message}`);
  }
  const max = data?.version == null ? 0 : Number(data.version);
  return max + 1;
}

export function createKbVersionRepo(
  supabase: SupabaseClient,
  tenantId: string,
  scopeId: string
) {
  return {
    async recordArticleVersion(
      article: Article,
      createdBy: string | null
    ): Promise<void> {
      try {
        const version = await nextVersion(
          supabase,
          "article_versions",
          "article_id",
          article.id,
          tenantId,
          scopeId
        );
        const { error } = await supabase
          .schema(SCHEMA)
          .from("article_versions")
          .insert({
            id: uuidv7(),
            tenant_id: tenantId,
            scope_id: scopeId,
            article_id: article.id,
            version,
            snapshot: articleToVersionSnapshot(article),
            created_by: createdBy,
          });
        if (error) {
          throw new Error(error.message);
        }
      } catch (e) {
        logger.warn("article version record failed", {
          articleId: article.id,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    },

    async recordFaqVersion(faq: Faq, createdBy: string | null): Promise<void> {
      try {
        const version = await nextVersion(
          supabase,
          "faq_versions",
          "faq_id",
          faq.id,
          tenantId,
          scopeId
        );
        const { error } = await supabase
          .schema(SCHEMA)
          .from("faq_versions")
          .insert({
            id: uuidv7(),
            tenant_id: tenantId,
            scope_id: scopeId,
            faq_id: faq.id,
            version,
            snapshot: faqToVersionSnapshot(faq),
            created_by: createdBy,
          });
        if (error) {
          throw new Error(error.message);
        }
      } catch (e) {
        logger.warn("faq version record failed", {
          faqId: faq.id,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    },

    async listArticleVersions(articleId: string): Promise<KbVersionSummary[]> {
      const { data, error } = await supabase
        .schema(SCHEMA)
        .from("article_versions")
        .select("version, created_at, created_by")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("article_id", articleId)
        .order("version", { ascending: false });
      if (error) {
        throw new Error(`Failed to list article versions: ${error.message}`);
      }
      return (data ?? []).map((r) => ({
        version: Number((r as { version: number }).version),
        created_at: String((r as { created_at: string }).created_at),
        created_by: (r as { created_by: string | null }).created_by ?? null,
      }));
    },

    async getArticleVersion(
      articleId: string,
      version: number
    ): Promise<KbVersionDetail | null> {
      const { data, error } = await supabase
        .schema(SCHEMA)
        .from("article_versions")
        .select("version, created_at, created_by, snapshot")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("article_id", articleId)
        .eq("version", version)
        .maybeSingle();
      if (error || !data) {
        return null;
      }
      const row = data as Record<string, unknown>;
      return {
        version: Number(row.version),
        created_at: String(row.created_at),
        created_by: row.created_by ? String(row.created_by) : null,
        snapshot: (row.snapshot as Record<string, unknown>) ?? {},
      };
    },

    async listFaqVersions(faqId: string): Promise<KbVersionSummary[]> {
      const { data, error } = await supabase
        .schema(SCHEMA)
        .from("faq_versions")
        .select("version, created_at, created_by")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("faq_id", faqId)
        .order("version", { ascending: false });
      if (error) {
        throw new Error(`Failed to list FAQ versions: ${error.message}`);
      }
      return (data ?? []).map((r) => ({
        version: Number((r as { version: number }).version),
        created_at: String((r as { created_at: string }).created_at),
        created_by: (r as { created_by: string | null }).created_by ?? null,
      }));
    },

    async getFaqVersion(
      faqId: string,
      version: number
    ): Promise<KbVersionDetail | null> {
      const { data, error } = await supabase
        .schema(SCHEMA)
        .from("faq_versions")
        .select("version, created_at, created_by, snapshot")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("faq_id", faqId)
        .eq("version", version)
        .maybeSingle();
      if (error || !data) {
        return null;
      }
      const row = data as Record<string, unknown>;
      return {
        version: Number(row.version),
        created_at: String(row.created_at),
        created_by: row.created_by ? String(row.created_by) : null,
        snapshot: (row.snapshot as Record<string, unknown>) ?? {},
      };
    },
  };
}

export type KbVersionRepo = ReturnType<typeof createKbVersionRepo>;
