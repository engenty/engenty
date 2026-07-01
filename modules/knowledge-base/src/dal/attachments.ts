import type { SupabaseClient } from "@supabase/supabase-js";
import { uuidv7 } from "uuidv7";
import type { Attachment, AttachmentInput } from "../schema/types.js";
import type { AttachmentRepo } from "./contracts.js";
import { rowToAttachment, SCHEMA } from "./shared.js";

export function createAttachmentRepo(
  supabase: SupabaseClient,
  tenantId: string,
  scopeId: string
): AttachmentRepo {
  const atts = () => supabase.schema(SCHEMA).from("attachments");

  const attachments: AttachmentRepo = {
    async create(input: AttachmentInput): Promise<Attachment> {
      const id = uuidv7();
      const { data, error } = await atts()
        .insert({
          id,
          tenant_id: tenantId,
          scope_id: scopeId,
          article_id: input.article_id,
          filename: input.filename,
          storage_key: input.storage_key,
          mime_type: input.mime_type,
          size_bytes: input.size_bytes,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) {
        throw new Error(`Failed to create attachment: ${error.message}`);
      }
      return rowToAttachment(data as Record<string, unknown>);
    },

    async listByArticle(articleId: string): Promise<Attachment[]> {
      const { data, error } = await atts()
        .select("*")
        .eq("article_id", articleId)
        .eq("tenant_id", tenantId)
        .order("created_at");
      if (error) {
        throw new Error(`Failed to list attachments: ${error.message}`);
      }
      return (data ?? []).map((r) =>
        rowToAttachment(r as Record<string, unknown>)
      );
    },

    async delete(id: string): Promise<boolean> {
      const { error } = await atts()
        .delete()
        .eq("id", id)
        .eq("tenant_id", tenantId);
      return !error;
    },
  };
  return attachments;
}
