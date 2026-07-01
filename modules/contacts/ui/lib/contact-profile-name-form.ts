import { z } from "zod";
import {
  formatDisplayName,
  resolveContactNameForWrite,
  splitFullNameHeuristic,
} from "../../src/services/contact-name.js";

export const contactProfileNameFormFieldsSchema = z.object({
  name_prefix: z.string(),
  first_name: z.string(),
  middle_name: z.string(),
  last_name: z.string(),
  name_suffix: z.string(),
  phonetic_name: z.string(),
  birth_name: z.string(),
  custom_display_name: z.boolean(),
  display_name_override: z.string(),
});

export type ContactProfileNameFormFields = z.infer<
  typeof contactProfileNameFormFieldsSchema
>;

export const emptyContactProfileNameFormFields: ContactProfileNameFormFields = {
  name_prefix: "",
  first_name: "",
  middle_name: "",
  last_name: "",
  name_suffix: "",
  phonetic_name: "",
  birth_name: "",
  custom_display_name: false,
  display_name_override: "",
};

export function contactProfileNameFormFieldsFromContact(contact: {
  birth_name: string | null;
  display_name: string;
  display_name_override: string | null;
  first_name: string | null;
  last_name: string | null;
  middle_name: string | null;
  name_prefix: string | null;
  name_suffix: string | null;
  phonetic_name: string | null;
}): ContactProfileNameFormFields {
  const hasOverride = Boolean(contact.display_name_override?.trim());
  return {
    name_prefix: contact.name_prefix ?? "",
    first_name: contact.first_name ?? "",
    middle_name: contact.middle_name ?? "",
    last_name: contact.last_name ?? "",
    name_suffix: contact.name_suffix ?? "",
    phonetic_name: contact.phonetic_name ?? "",
    birth_name: contact.birth_name ?? "",
    custom_display_name: hasOverride,
    display_name_override:
      contact.display_name_override ?? contact.display_name ?? "",
  };
}

export function previewDisplayNameFromForm(
  fields: ContactProfileNameFormFields
): string {
  if (fields.custom_display_name && fields.display_name_override.trim()) {
    return fields.display_name_override.trim();
  }
  return formatDisplayName({
    name_prefix: fields.name_prefix,
    first_name: fields.first_name,
    middle_name: fields.middle_name,
    last_name: fields.last_name,
    name_suffix: fields.name_suffix,
  });
}

export function contactProfileNamePayloadFromForm(
  fields: ContactProfileNameFormFields
) {
  return resolveContactNameForWrite({
    name_prefix: fields.name_prefix,
    first_name: fields.first_name,
    middle_name: fields.middle_name,
    last_name: fields.last_name,
    name_suffix: fields.name_suffix,
    phonetic_name: fields.phonetic_name,
    birth_name: fields.birth_name,
    display_name_override: fields.custom_display_name
      ? fields.display_name_override
      : null,
  });
}

export function applySplitFullNameToContactFormFields(
  fullName: string
): Partial<ContactProfileNameFormFields> {
  const parts = splitFullNameHeuristic(fullName);
  return {
    name_prefix: parts.name_prefix ?? "",
    first_name: parts.first_name ?? "",
    middle_name: parts.middle_name ?? "",
    last_name: parts.last_name ?? "",
    name_suffix: parts.name_suffix ?? "",
    custom_display_name: false,
    display_name_override: "",
  };
}
