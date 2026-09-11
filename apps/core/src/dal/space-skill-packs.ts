import { librarySkillNamesByCategory } from "@engenty/ai-skills";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  listSpaceMounts,
  removeSpaceMount,
  upsertSpaceMount,
} from "./space-mounts.js";

export class UnknownSkillPackError extends Error {
  readonly category: string;

  constructor(category: string) {
    super(`unknown_skill_pack:${category}`);
    this.name = "UnknownSkillPackError";
    this.category = category;
  }
}

export function skillNamesForLibraryCategory(
  category: string,
  namesByCategory = librarySkillNamesByCategory()
): string[] {
  const names = namesByCategory[category];
  if (!names || names.length === 0) {
    throw new UnknownSkillPackError(category);
  }
  return [...names];
}

/**
 * Keep a pack skill mounted when a still-mounted module owns that name.
 * Unique names make this defensive; prefix match follows the UI module-skill rule.
 */
export function shouldRetainSkillOnPackUnmount(
  skillName: string,
  mountedModuleIds: ReadonlySet<string>
): boolean {
  for (const moduleId of mountedModuleIds) {
    if (skillName === moduleId || skillName.startsWith(`${moduleId}-`)) {
      return true;
    }
  }
  return false;
}

export async function mountLibrarySkillPack(
  client: SupabaseClient,
  tenantId: string,
  spaceId: string,
  category: string
): Promise<{ category: string; mounted: string[] }> {
  const names = skillNamesForLibraryCategory(category);
  for (const name of names) {
    await upsertSpaceMount(client, tenantId, spaceId, {
      resourceKey: name,
      resourceType: "skill",
    });
  }
  return { category, mounted: names };
}

export async function unmountLibrarySkillPack(
  client: SupabaseClient,
  tenantId: string,
  spaceId: string,
  category: string
): Promise<{ category: string; retained: string[]; unmounted: string[] }> {
  const names = skillNamesForLibraryCategory(category);
  const mounts = await listSpaceMounts(client, tenantId, spaceId);
  const mountedModuleIds = new Set(
    mounts
      .filter((mount) => mount.resourceType === "module")
      .map((mount) => mount.resourceKey)
  );
  const unmounted: string[] = [];
  const retained: string[] = [];
  for (const name of names) {
    if (shouldRetainSkillOnPackUnmount(name, mountedModuleIds)) {
      retained.push(name);
      continue;
    }
    await removeSpaceMount(client, tenantId, spaceId, "skill", name);
    unmounted.push(name);
  }
  return { category, retained, unmounted };
}
