import { z } from "zod";

export const teamMemberFieldVisibilitySchema = z.enum([
  "shared",
  "private",
  "employment",
]);
export type TeamMemberFieldVisibility = z.infer<
  typeof teamMemberFieldVisibilitySchema
>;

export const TEAM_MEMBER_FIELD_VISIBILITY_ORDER: TeamMemberFieldVisibility[] = [
  "shared",
  "private",
  "employment",
];

export const teamMemberFieldTypeSchema = z.enum([
  "text_input",
  "text_formatted",
  "text_tiptap",
  "number",
  "date",
  "date_range",
  "url",
  "image",
  "file",
  "select",
]);
export type TeamMemberFieldType = z.infer<typeof teamMemberFieldTypeSchema>;

const FIELD_KEY_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface TeamMemberFieldDefinition {
  created_at: string;
  description: string;
  field_key: string;
  field_type: TeamMemberFieldType;
  id: string;
  label: string;
  multiple: boolean;
  options: string[];
  sort_order: number;
  tenant_id: string;
  updated_at: string;
  visibility: TeamMemberFieldVisibility;
}

export type TeamMemberFieldDefinitionInput = Pick<
  TeamMemberFieldDefinition,
  | "description"
  | "field_key"
  | "field_type"
  | "id"
  | "label"
  | "multiple"
  | "options"
  | "sort_order"
  | "visibility"
>;

export const teamMemberFieldDefinitionSchema = z
  .object({
    id: z.string().min(1),
    visibility: teamMemberFieldVisibilitySchema,
    field_type: teamMemberFieldTypeSchema,
    label: z.string().min(1).max(256),
    description: z.string().max(1024).default(""),
    field_key: z.string().min(1).max(64),
    options: z.array(z.string().min(1)).default([]),
    sort_order: z.number().int().min(0),
    multiple: z.boolean().default(false),
  })
  .superRefine((val, ctx) => {
    if (!FIELD_KEY_REGEX.test(val.field_key)) {
      ctx.addIssue({
        code: "custom",
        message: "field_key must be lowercase slug segments (a-z, 0-9, hyphen)",
        path: ["field_key"],
      });
    }
    if (val.field_type === "select" && val.options.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "select fields require at least one option",
        path: ["options"],
      });
    }
    if (val.field_type !== "select" && val.options.length > 0) {
      ctx.addIssue({
        code: "custom",
        message: "options are only allowed for select fields",
        path: ["options"],
      });
    }
    if (
      val.multiple &&
      val.field_type !== "image" &&
      val.field_type !== "file"
    ) {
      ctx.addIssue({
        code: "custom",
        message: "multiple is only allowed for image and file fields",
        path: ["multiple"],
      });
    }
  });

export const teamMemberFieldDefinitionsSchema = z
  .array(teamMemberFieldDefinitionSchema)
  .superRefine((arr, ctx) => {
    const keys = new Set<string>();
    for (let i = 0; i < arr.length; i++) {
      const key = arr[i]?.field_key;
      if (!key) {
        continue;
      }
      if (keys.has(key)) {
        ctx.addIssue({
          code: "custom",
          message: "duplicate field_key",
          path: [i, "field_key"],
        });
      }
      keys.add(key);
    }
  });

export const teamMemberFieldDefinitionsPutSchema = z.object({
  definitions: teamMemberFieldDefinitionsSchema,
});

export function teamMemberFieldTypeSupportsMultiple(
  fieldType: TeamMemberFieldType
): boolean {
  return fieldType === "image" || fieldType === "file";
}
