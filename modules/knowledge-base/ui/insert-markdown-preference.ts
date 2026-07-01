export type InsertMarkdownPreference = "ask" | "always" | "always_if_empty";

const STORAGE_KEY = "engenty.kb.insertConvertedMarkdown";

const DEFAULT_PREFERENCE: InsertMarkdownPreference = "ask";

export function getInsertMarkdownPreference(): InsertMarkdownPreference {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "ask" || raw === "always" || raw === "always_if_empty") {
      return raw;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_PREFERENCE;
}

export function setInsertMarkdownPreference(
  value: InsertMarkdownPreference
): void {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* ignore */
  }
}
