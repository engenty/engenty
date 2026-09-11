import type { KnowledgeBase } from "../src/schema/types.js";

type KbNameSource = Pick<KnowledgeBase, "name" | "slug">;

/**
 * User-facing KB title.
 *
 * A library created from the "new article" empty state ships with
 * `name = "Default"` as a sentinel. Until the user gives it a real name, we
 * substitute the localized product label ("Knowledge Base" /
 * "Wissensdatenbank") so the UI reads naturally.
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
