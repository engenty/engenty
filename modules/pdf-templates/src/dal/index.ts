import {
  createDefaultPdfTemplateSettings,
  type PdfTemplateInput,
  type PdfTemplateListItem,
  type PdfTemplateUpdateInput,
  pdfTemplateSettingsSchema,
} from "@engenty/pdf-templates/core";
import type { SupabaseClient } from "@supabase/supabase-js";
import { uuidv7 } from "uuidv7";
import { z } from "zod";

function parseSettings(raw: unknown) {
  const parsed = pdfTemplateSettingsSchema.safeParse(raw ?? {});
  if (parsed.success) {
    return parsed.data;
  }
  return createDefaultPdfTemplateSettings();
}

function rowToTemplate(row: Record<string, unknown>): PdfTemplateListItem {
  return {
    id: String(row.id),
    module_key: String(row.module_key),
    name: String(row.name ?? ""),
    is_default: Boolean(row.is_default),
    schema_version: Number(row.schema_version ?? 1),
    settings_json: parseSettings(row.settings_json),
    document_id: String(row.document_id),
    document_key: String(row.document_key ?? "default"),
    engine: "xml_liquid_v1",
    document_template: String(row.document_template ?? ""),
    stylesheet_template: String(row.stylesheet_template ?? ""),
    input_schema_json:
      (row.input_schema_json as Record<string, unknown> | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export type PdfTemplatesRepoSupabase = ReturnType<
  typeof createPdfTemplatesRepoSupabase
>;

export function createPdfTemplatesRepoSupabase(
  adapter: unknown,
  tenantId: string,
  scopeId: string
) {
  const supabase = adapter as SupabaseClient;
  const schema = "module_pdf_templates";
  const templates = () => supabase.schema(schema).from("templates");
  const documents = () => supabase.schema(schema).from("template_documents");

  return {
    async listTemplates(moduleKey: string): Promise<PdfTemplateListItem[]> {
      const { data, error } = await templates()
        .select(
          "id,module_key,name,is_default,schema_version,settings_json,created_at,updated_at,template_documents!inner(id,document_key,engine,document_template,stylesheet_template,input_schema_json)"
        )
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("module_key", moduleKey)
        .is("deleted_at", null)
        .eq("template_documents.document_key", "default")
        .order("is_default", { ascending: false })
        .order("name", { ascending: true });

      if (error) {
        throw new Error(`Failed to list PDF templates: ${error.message}`);
      }

      return (data ?? []).map((row) => {
        const record = row as Record<string, unknown>;
        const document = Array.isArray(record.template_documents)
          ? (record.template_documents[0] as Record<string, unknown>)
          : (record.template_documents as Record<string, unknown>);
        return rowToTemplate({
          ...record,
          document_id: document?.id,
          document_key: document?.document_key,
          engine: document?.engine,
          document_template: document?.document_template,
          stylesheet_template: document?.stylesheet_template,
          input_schema_json: document?.input_schema_json ?? null,
        });
      });
    },

    async getTemplateById(id: string): Promise<PdfTemplateListItem | null> {
      const { data, error } = await templates()
        .select(
          "id,module_key,name,is_default,schema_version,settings_json,created_at,updated_at,template_documents!inner(id,document_key,engine,document_template,stylesheet_template,input_schema_json)"
        )
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("id", id)
        .is("deleted_at", null)
        .eq("template_documents.document_key", "default")
        .single();

      if (error || !data) {
        return null;
      }

      const row = data as Record<string, unknown>;
      const document = Array.isArray(row.template_documents)
        ? (row.template_documents[0] as Record<string, unknown>)
        : (row.template_documents as Record<string, unknown>);

      return rowToTemplate({
        ...row,
        document_id: document?.id,
        document_key: document?.document_key,
        engine: document?.engine,
        document_template: document?.document_template,
        stylesheet_template: document?.stylesheet_template,
        input_schema_json: document?.input_schema_json ?? null,
      });
    },

    async getDefaultTemplate(
      moduleKey: string
    ): Promise<PdfTemplateListItem | null> {
      const { data, error } = await templates()
        .select(
          "id,module_key,name,is_default,schema_version,settings_json,created_at,updated_at,template_documents!inner(id,document_key,engine,document_template,stylesheet_template,input_schema_json)"
        )
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("module_key", moduleKey)
        .eq("is_default", true)
        .is("deleted_at", null)
        .eq("template_documents.document_key", "default")
        .maybeSingle();

      if (error || !data) {
        return null;
      }

      const row = data as Record<string, unknown>;
      const document = Array.isArray(row.template_documents)
        ? (row.template_documents[0] as Record<string, unknown>)
        : (row.template_documents as Record<string, unknown>);

      return rowToTemplate({
        ...row,
        document_id: document?.id,
        document_key: document?.document_key,
        engine: document?.engine,
        document_template: document?.document_template,
        stylesheet_template: document?.stylesheet_template,
        input_schema_json: document?.input_schema_json ?? null,
      });
    },

    async createTemplate(
      input: PdfTemplateInput
    ): Promise<PdfTemplateListItem> {
      const now = new Date().toISOString();
      const templateId = uuidv7();
      const documentId = uuidv7();
      const existing = await this.listTemplates(input.module_key);
      const isDefault = input.is_default || existing.length === 0;

      if (isDefault) {
        await templates()
          .update({ is_default: false, updated_at: now })
          .eq("tenant_id", tenantId)
          .eq("scope_id", scopeId)
          .eq("module_key", input.module_key)
          .is("deleted_at", null);
      }

      const templateRow = {
        id: templateId,
        tenant_id: tenantId,
        scope_id: scopeId,
        module_key: input.module_key,
        name: input.name,
        is_default: isDefault,
        schema_version: input.schema_version,
        settings_json: input.settings_json,
        created_at: now,
        updated_at: now,
      };

      const { error: templateError } = await templates().insert(templateRow);
      if (templateError) {
        throw new Error(
          `Failed to create PDF template: ${templateError.message}`
        );
      }

      const { error: documentError } = await documents().insert({
        id: documentId,
        tenant_id: tenantId,
        scope_id: scopeId,
        template_id: templateId,
        document_key: input.document_key,
        engine: input.engine,
        document_template: input.document_template,
        stylesheet_template: input.stylesheet_template,
        input_schema_json: null,
        created_at: now,
        updated_at: now,
      });

      if (documentError) {
        await templates().delete().eq("id", templateId);
        throw new Error(
          `Failed to create PDF template document: ${documentError.message}`
        );
      }

      const created = (await this.listTemplates(input.module_key)).find(
        (template) => template.id === templateId
      );
      if (!created) {
        throw new Error("Failed to load created PDF template.");
      }
      return created;
    },

    async updateTemplate(
      id: string,
      patch: PdfTemplateUpdateInput
    ): Promise<PdfTemplateListItem | null> {
      const existing = (
        await templates()
          .select("id,module_key")
          .eq("id", id)
          .eq("tenant_id", tenantId)
          .eq("scope_id", scopeId)
          .is("deleted_at", null)
          .single()
      ).data as { id: string; module_key: string } | null;

      if (!existing) {
        return null;
      }

      const now = new Date().toISOString();
      const templatePatch: Record<string, unknown> = { updated_at: now };
      if (patch.name !== undefined) {
        templatePatch.name = patch.name;
      }
      if (patch.is_default !== undefined) {
        templatePatch.is_default = patch.is_default;
      }
      if (patch.schema_version !== undefined) {
        templatePatch.schema_version = patch.schema_version;
      }
      if (patch.settings_json !== undefined) {
        templatePatch.settings_json = patch.settings_json;
      }

      if (patch.is_default) {
        await templates()
          .update({ is_default: false, updated_at: now })
          .eq("tenant_id", tenantId)
          .eq("scope_id", scopeId)
          .eq("module_key", existing.module_key)
          .neq("id", id)
          .is("deleted_at", null);
      }

      const { error: templateError } = await templates()
        .update(templatePatch)
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId);

      if (templateError) {
        throw new Error(
          `Failed to update PDF template: ${templateError.message}`
        );
      }

      const documentPatch: Record<string, unknown> = { updated_at: now };
      if (patch.document_template !== undefined) {
        documentPatch.document_template = patch.document_template;
      }
      if (patch.stylesheet_template !== undefined) {
        documentPatch.stylesheet_template = patch.stylesheet_template;
      }

      if (Object.keys(documentPatch).length > 1) {
        const { error: documentError } = await documents()
          .update(documentPatch)
          .eq("template_id", id)
          .eq("tenant_id", tenantId)
          .eq("scope_id", scopeId)
          .eq("document_key", "default");
        if (documentError) {
          throw new Error(
            `Failed to update PDF template document: ${documentError.message}`
          );
        }
      }

      return (
        (await this.listTemplates(existing.module_key)).find(
          (template) => template.id === id
        ) ?? null
      );
    },

    async deleteTemplate(id: string): Promise<boolean> {
      const existing = (
        await templates()
          .select("id,module_key,is_default")
          .eq("id", id)
          .eq("tenant_id", tenantId)
          .eq("scope_id", scopeId)
          .is("deleted_at", null)
          .single()
      ).data as { id: string; module_key: string; is_default: boolean } | null;

      if (!existing) {
        return false;
      }

      const now = new Date().toISOString();
      const { error } = await templates()
        .update({ deleted_at: now, updated_at: now })
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId);

      if (error) {
        throw new Error(`Failed to delete PDF template: ${error.message}`);
      }

      if (existing.is_default) {
        const remaining = await this.listTemplates(existing.module_key);
        const next = remaining[0];
        if (next) {
          await templates()
            .update({ is_default: true, updated_at: new Date().toISOString() })
            .eq("id", next.id)
            .eq("tenant_id", tenantId)
            .eq("scope_id", scopeId);
        }
      }

      return true;
    },

    buildInputSchemaSnapshot(schema: z.ZodType) {
      return z.toJSONSchema(schema) as Record<string, unknown>;
    },
  };
}
