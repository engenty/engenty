import { createAiDatabaseAdapter } from "../../infra/database.js";

function asDisplayName(row: Record<string, unknown>): string | null {
  const displayName =
    typeof row.display_name === "string" ? row.display_name.trim() : "";
  if (displayName) {
    return displayName;
  }
  const email = typeof row.email === "string" ? row.email.trim() : "";
  if (email) {
    return email.split("@")[0] || email;
  }
  return null;
}

/** Server-resolved names for speaker tags. Never trust a client-supplied name. */
export async function resolveUserDisplayNames(
  userIds: readonly string[]
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const ids = [...new Set(userIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) {
    return names;
  }
  const db = createAiDatabaseAdapter();
  if (!db) {
    return names;
  }
  const { data, error } = await db
    .schema("core")
    .from("users")
    .select("id, email, display_name")
    .in("id", ids);
  if (error || !data) {
    return names;
  }
  for (const row of data as Record<string, unknown>[]) {
    const id = typeof row.id === "string" ? row.id : "";
    const name = asDisplayName(row);
    if (id && name) {
      names.set(id, name);
    }
  }
  return names;
}
