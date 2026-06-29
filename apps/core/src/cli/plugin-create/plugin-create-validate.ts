import fs from "node:fs";

const KEBAB_SLUG_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export function slugFromDisplayName(displayName: string): string {
  return displayName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isValidKebabPluginSlug(slug: string): boolean {
  return KEBAB_SLUG_RE.test(slug.trim());
}

export function listExistingModuleSlugs(modulesDir: string): string[] {
  if (!(fs.existsSync(modulesDir) && fs.statSync(modulesDir).isDirectory())) {
    return [];
  }
  return fs
    .readdirSync(modulesDir, { withFileTypes: true })
    .filter((ent) => ent.isDirectory() && !ent.name.startsWith("."))
    .map((ent) => ent.name)
    .sort();
}

export function validateNewPluginSlug(params: {
  existingSlugs: readonly string[];
  slug: string;
}): string | undefined {
  const slug = params.slug.trim();
  if (!slug) {
    return "Plugin id is required.";
  }
  if (!isValidKebabPluginSlug(slug)) {
    return "Plugin id must be kebab-case (lowercase letters, digits, single hyphens; no leading/trailing hyphen).";
  }
  if (params.existingSlugs.includes(slug)) {
    return `A module already exists at modules/${slug}/ (choose a different id).`;
  }
  return;
}
