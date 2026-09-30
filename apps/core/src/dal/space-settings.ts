/**
 * A space's own key/value store (`core.space_settings`) — the typed-value
 * shape of `core.tenant_settings` and `core.user_settings`, one set per space.
 * Values that belong on the space but are not columns live here and ride on
 * every space read through {@link SPACE_SETTINGS_EMBED}. First key: `cover`.
 */
import type { Cover } from "@engenty/covers";
import type { SupabaseClient } from "@supabase/supabase-js";

/** PostgREST embed for space selects (FK `space_settings.space_id`). */
export const SPACE_SETTINGS_EMBED =
  "space_settings(name,type,value_string,value_jsonb,value_numeric,value_boolean)";

export interface SpaceSettingsEmbedRow {
  name: string;
  value_jsonb: unknown;
}

/** The home header's cover from an embedded `space_settings` array. */
export function spaceCoverFromEmbed(embed: unknown): Cover | null {
  const rows = Array.isArray(embed) ? (embed as SpaceSettingsEmbedRow[]) : [];
  const cover = rows.find((row) => row.name === "cover")?.value_jsonb;
  return (cover as Cover | undefined) ?? null;
}

/** Store the cover (`null` removes it). */
export async function writeSpaceCover(
  client: SupabaseClient,
  tenantId: string,
  spaceId: string,
  cover: Cover | null
): Promise<void> {
  const table = client.schema("core").from("space_settings");
  const { error } = cover
    ? await table.upsert(
        {
          name: "cover",
          space_id: spaceId,
          tenant_id: tenantId,
          type: "json",
          updated_at: new Date().toISOString(),
          value_jsonb: cover,
        },
        { onConflict: "tenant_id,space_id,name" }
      )
    : await table
        .delete()
        .eq("tenant_id", tenantId)
        .eq("space_id", spaceId)
        .eq("name", "cover");
  if (error) {
    throw error;
  }
}
