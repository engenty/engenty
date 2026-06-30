import { z } from "zod";
import {
  formatDisplayName,
  isProfileNameWriteValid,
  resolveProfileNameForWrite,
  splitFullNameHeuristic,
} from "../../src/services/profile-name.js";

export const teamProfileNameFormFieldsSchema = z
  .object({
    name_prefix: z.string(),
    first_name: z.string(),
    middle_name: z.string(),
    last_name: z.string(),
    name_suffix: z.string(),
    phonetic_name: z.string(),
    birth_name: z.string(),
    custom_display_name: z.boolean(),
    full_name_override: z.string(),
  })
  .superRefine((data, ctx) => {
    const valid = isProfileNameWriteValid({
      name_prefix: data.name_prefix,
      first_name: data.first_name,
      middle_name: data.middle_name,
      last_name: data.last_name,
      name_suffix: data.name_suffix,
      phonetic_name: data.phonetic_name,
      birth_name: data.birth_name,
      full_name_override: data.custom_display_name
        ? data.full_name_override
        : null,
    });
    if (!valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Required",
        path: ["last_name"],
      });
    }
  });

export type TeamProfileNameFormFields = z.infer<
  typeof teamProfileNameFormFieldsSchema
>;

export const emptyTeamProfileNameFormFields: TeamProfileNameFormFields = {
  name_prefix: "",
  first_name: "",
  middle_name: "",
  last_name: "",
  name_suffix: "",
  phonetic_name: "",
  birth_name: "",
  custom_display_name: false,
  full_name_override: "",
};

export function teamProfileNameFormFieldsFromMember(member: {
  birth_name: string | null;
  first_name: string | null;
  full_name: string;
  full_name_override: string | null;
  last_name: string | null;
  middle_name: string | null;
  name_prefix: string | null;
  name_suffix: string | null;
  phonetic_name: string | null;
}): TeamProfileNameFormFields {
  const hasOverride = Boolean(member.full_name_override?.trim());
  return {
    name_prefix: member.name_prefix ?? "",
    first_name: member.first_name ?? "",
    middle_name: member.middle_name ?? "",
    last_name: member.last_name ?? "",
    name_suffix: member.name_suffix ?? "",
    phonetic_name: member.phonetic_name ?? "",
    birth_name: member.birth_name ?? "",
    custom_display_name: hasOverride,
    full_name_override: member.full_name_override ?? member.full_name ?? "",
  };
}

export function previewDisplayNameFromForm(
  fields: TeamProfileNameFormFields
): string {
  if (fields.custom_display_name && fields.full_name_override.trim()) {
    return fields.full_name_override.trim();
  }
  return formatDisplayName({
    name_prefix: fields.name_prefix,
    first_name: fields.first_name,
    middle_name: fields.middle_name,
    last_name: fields.last_name,
    name_suffix: fields.name_suffix,
  });
}

export function teamProfileNamePayloadFromForm(
  fields: TeamProfileNameFormFields
) {
  return resolveProfileNameForWrite({
    name_prefix: fields.name_prefix,
    first_name: fields.first_name,
    middle_name: fields.middle_name,
    last_name: fields.last_name,
    name_suffix: fields.name_suffix,
    phonetic_name: fields.phonetic_name,
    birth_name: fields.birth_name,
    full_name_override: fields.custom_display_name
      ? fields.full_name_override
      : null,
  });
}

export function applySplitFullNameToFormFields(
  fullName: string
): Partial<TeamProfileNameFormFields> {
  const parts = splitFullNameHeuristic(fullName);
  return {
    name_prefix: parts.name_prefix ?? "",
    first_name: parts.first_name ?? "",
    middle_name: parts.middle_name ?? "",
    last_name: parts.last_name ?? "",
    name_suffix: parts.name_suffix ?? "",
    custom_display_name: false,
    full_name_override: "",
  };
}
