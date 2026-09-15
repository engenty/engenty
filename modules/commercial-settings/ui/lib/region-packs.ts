import {
  STANDARD_CATEGORY_PRESETS as categoryPresets,
  accountClassFromNumber as deriveAccountClass,
  type CategoryPreset as PackCategoryPreset,
  STANDARD_TAX_PRESETS as taxPresets,
} from "../../src/region-packs.js";

export type CategoryPreset = PackCategoryPreset;
export const STANDARD_CATEGORY_PRESETS = categoryPresets;
export const STANDARD_TAX_PRESETS = taxPresets;
export const accountClassFromNumber = deriveAccountClass;
