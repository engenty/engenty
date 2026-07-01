import { z } from "zod";

export const kbTemplateBindingModeSchema = z.enum([
  "inherit",
  "none",
  "template",
]);
export type KbTemplateBindingMode = z.infer<typeof kbTemplateBindingModeSchema>;

export const kbTemplatePropertyTypeSchema = z.enum([
  "text",
  "number",
  "date",
  "url",
  "select",
]);
export type KbTemplatePropertyType = z.infer<
  typeof kbTemplatePropertyTypeSchema
>;

const TEMPLATE_PROPERTY_KEY_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface KbTemplatePropertyDefinition {
  description: string;
  id: string;
  key: string;
  label: string;
  options?: string[];
  order: number;
  show_in_compact?: boolean;
  type: KbTemplatePropertyType;
  visible?: boolean;
}

export interface KbArticleTemplate {
  content_json: Record<string, unknown> | null;
  content_markdown: string | null;
  created_at: string;
  deleted_at: string | null;
  description: string | null;
  id: string;
  kb_id: string;
  name: string;
  property_definitions: KbTemplatePropertyDefinition[];
  scope_id: string;
  tenant_id: string;
  updated_at: string;
}

export type KbArticleTemplateInput = Pick<
  KbArticleTemplate,
  | "content_json"
  | "content_markdown"
  | "description"
  | "kb_id"
  | "name"
  | "property_definitions"
>;

export type KbArticleTemplateUpdateInput = Partial<
  Pick<
    KbArticleTemplate,
    | "content_json"
    | "content_markdown"
    | "description"
    | "name"
    | "property_definitions"
  >
>;

const tiptapJsonSchema: z.ZodType<Record<string, unknown>> = z
  .record(z.string(), z.unknown())
  .refine((v) => v && typeof v === "object" && !Array.isArray(v), {
    message: "content_json must be an object",
  });

export const kbTemplatePropertyDefinitionSchema = z
  .object({
    id: z.string().min(1),
    key: z.string().min(1).max(64),
    label: z.string().min(1).max(256),
    description: z.string().max(1024).default(""),
    order: z.number().int().min(0),
    type: kbTemplatePropertyTypeSchema,
    options: z.array(z.string().min(1)).optional(),
    visible: z.boolean().optional().default(true),
    show_in_compact: z.boolean().optional().default(false),
  })
  .superRefine((val, ctx) => {
    if (!TEMPLATE_PROPERTY_KEY_REGEX.test(val.key)) {
      ctx.addIssue({
        code: "custom",
        message: "key must be lowercase slug segments (a-z, 0-9, hyphen)",
        path: ["key"],
      });
    }
    if (
      val.type !== "select" &&
      val.options !== undefined &&
      val.options.length > 0
    ) {
      ctx.addIssue({
        code: "custom",
        message: "options are only allowed for select properties",
        path: ["options"],
      });
    }
  });

export const kbTemplatePropertyDefinitionsSchema = z
  .array(kbTemplatePropertyDefinitionSchema)
  .superRefine((arr, ctx) => {
    const keys = new Set<string>();
    for (let i = 0; i < arr.length; i++) {
      const key = arr[i]?.key;
      if (!key) {
        continue;
      }
      if (keys.has(key)) {
        ctx.addIssue({
          code: "custom",
          message: "duplicate template property key",
          path: [i, "key"],
        });
      }
      keys.add(key);
    }
  });

export const kbArticleTemplateCreateSchema = z.object({
  kb_id: z.string().min(1),
  name: z.string().min(1).max(256),
  description: z.string().max(2048).nullable().optional(),
  property_definitions: kbTemplatePropertyDefinitionsSchema
    .optional()
    .default([]),
  content_json: tiptapJsonSchema.nullable().optional(),
  content_markdown: z.string().nullable().optional(),
});

export const kbArticleTemplateUpdateSchema = kbArticleTemplateCreateSchema
  .omit({ kb_id: true })
  .partial();

export const kbTemplateContentModeSchema = z.enum([
  "template_only",
  "template_before_full_content",
  "template_before_summary",
  "full_content",
  "summary",
]);
export type KbTemplateContentMode = z.infer<typeof kbTemplateContentModeSchema>;

export function kbTemplateHasContentStructure(
  template: Pick<KbArticleTemplate, "content_json" | "content_markdown"> | null
): boolean {
  if (!template) {
    return false;
  }
  return Boolean(
    template.content_json ||
      (typeof template.content_markdown === "string" &&
        template.content_markdown.trim())
  );
}
