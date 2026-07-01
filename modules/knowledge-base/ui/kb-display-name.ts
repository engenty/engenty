import type { KnowledgeBase } from "../src/schema/types.js";

type KbNameSource = Pick<KnowledgeBase, "name" | "slug" | "is_default">;

/**
 * User-facing KB title.
 *
 * The seeded default KB ships with `name = "Default"` as a sentinel. Until the
 * user gives it a real name, we substitute the localized product label
 * ("Knowledge Base" / "Wissensdatenbank") so the UI reads naturally. Once the
 * user renames it, we honor that name even if `is_default` is still true —
 * otherwise the rename would have no visible effect.
 */
export function kbDisplayName(
  kb: KbNameSource,
  t: (key: string) => string
): string {
  const trimmed = kb.name?.trim() ?? "";
  if (trimmed.length === 0 || trimmed === "Default") {
    return t("hub.default_kb_label");
  }
  return trimmed;
}
