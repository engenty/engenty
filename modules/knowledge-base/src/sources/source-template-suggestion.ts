/**
 * Turning a proposed template into a storable one.
 *
 * The model proposes labels and types. Keys, ids and ordering are ours: a key
 * must be a lowercase slug and unique within the template, and letting a model
 * mint those is how you get `property_definitions` the API rejects — after the
 * user has already waited for the suggestion.
 */

import type {
  KbTemplatePropertyDefinition,
  KbTemplatePropertyType,
} from "../schema/templates.js";

const MAX_KEY_LENGTH = 64;

/** Matches TEMPLATE_PROPERTY_KEY_REGEX in the template schema. */
export function kbTemplatePropertyKeyFromLabel(label: string): string {
  // Umlauts first: NFD would decompose "ä" into "a" + a combining mark, and
  // stripping the mark turns "Zuständigkeit" into "zustandigkeit" — readable,
  // but not the transliteration a German-speaking reader expects.
  const slug = label
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_KEY_LENGTH)
    .replace(/-+$/, "");
  return slug;
}

export interface KbSuggestedTemplateProperty {
  description?: string;
  label: string;
  options?: string[];
  type: KbTemplatePropertyType;
}

/**
 * Assign keys, ids and order. Properties whose label yields no usable slug are
 * dropped rather than stored under a made-up key, and a repeated key gets a
 * numeric suffix instead of silently overwriting its twin.
 */
export function normalizeSuggestedTemplateProperties(
  suggested: readonly KbSuggestedTemplateProperty[],
  makeId: () => string
): KbTemplatePropertyDefinition[] {
  const used = new Set<string>();
  const out: KbTemplatePropertyDefinition[] = [];
  for (const property of suggested) {
    const label = property.label.trim();
    const base = kbTemplatePropertyKeyFromLabel(label);
    if (!(label && base)) {
      continue;
    }
    let key = base;
    let suffix = 2;
    while (used.has(key)) {
      key = `${base.slice(0, MAX_KEY_LENGTH - 2)}-${suffix}`;
      suffix += 1;
    }
    used.add(key);
    const options =
      property.type === "select"
        ? (property.options ?? []).map((o) => o.trim()).filter(Boolean)
        : undefined;
    out.push({
      description: property.description?.trim() ?? "",
      id: makeId(),
      key,
      label,
      order: out.length,
      show_in_compact: out.length < 3,
      type: property.type,
      ...(options && options.length > 0 ? { options } : {}),
      visible: true,
    });
  }
  return out;
}
