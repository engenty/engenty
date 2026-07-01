import type {
  Contact,
  ContactInput,
  ContactUpdateInput,
} from "../schema/types.js";
import {
  formatDisplayName,
  resolveContactNameForWrite,
} from "./contact-name.js";

const CONTACT_NAME_PART_KEYS = [
  "name_prefix",
  "first_name",
  "middle_name",
  "last_name",
  "name_suffix",
  "phonetic_name",
  "birth_name",
  "display_name_override",
  "display_name",
] as const;

function resolvePersonNameFields(
  input: Partial<ContactInput>,
  existing?: Contact
) {
  const resolved = resolveContactNameForWrite({
    name_prefix: input.name_prefix ?? existing?.name_prefix,
    first_name: input.first_name ?? existing?.first_name,
    middle_name: input.middle_name ?? existing?.middle_name,
    last_name: input.last_name ?? existing?.last_name,
    name_suffix: input.name_suffix ?? existing?.name_suffix,
    phonetic_name: input.phonetic_name ?? existing?.phonetic_name,
    birth_name: input.birth_name ?? existing?.birth_name,
    display_name_override:
      input.display_name_override ?? existing?.display_name_override,
    display_name: input.display_name ?? existing?.display_name,
  });
  const structuredLabel = formatDisplayName(resolved.parts);
  return {
    ...resolved.parts,
    display_name: resolved.display_name,
    legal_name:
      structuredLabel || existing?.legal_name || input.legal_name || null,
  };
}

export function applyResolvedPersonNameToContactInput(
  input: ContactInput
): ContactInput {
  if (input.type !== "person") {
    return input;
  }
  return { ...input, ...resolvePersonNameFields(input) };
}

export function applyResolvedPersonNameToContactPatch(
  existing: Contact,
  patch: ContactUpdateInput
): ContactUpdateInput {
  const nextType = patch.type ?? existing.type;
  if (nextType !== "person") {
    return patch;
  }
  const touchesName = CONTACT_NAME_PART_KEYS.some(
    (key) =>
      key in patch && patch[key as keyof ContactUpdateInput] !== undefined
  );
  if (!touchesName) {
    return patch;
  }
  return { ...patch, ...resolvePersonNameFields(patch, existing) };
}
