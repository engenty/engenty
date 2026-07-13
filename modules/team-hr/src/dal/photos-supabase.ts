import type { SupabaseClient } from "@supabase/supabase-js";
import { uuidv7 } from "uuidv7";
import type { TeamMemberGalleryPhoto } from "../schema/hr-records.js";

function rowToGalleryPhoto(
  row: Record<string, unknown>
): TeamMemberGalleryPhoto {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    scope_id: String(row.scope_id),
    profile_id: String(row.profile_id),
    storage_key: String(row.storage_key),
    title: (row.title as string | null) ?? null,
    alt_text: (row.alt_text as string | null) ?? null,
    copyright: (row.copyright as string | null) ?? null,
    sort_order: Number(row.sort_order ?? 0),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export type TeamMemberGalleryPhotosRepoSupabase = ReturnType<
  typeof createTeamMemberGalleryPhotosRepoSupabase
>;

export function createTeamMemberGalleryPhotosRepoSupabase(
  adapter: unknown,
  tenantId: string,
  scopeId: string
) {
  const supabase = adapter as SupabaseClient;
  const schema = "module_team";
  const table = () =>
    supabase.schema(schema).from("team_member_gallery_photos");

  return {
    async listByProfileId(
      profileId: string
    ): Promise<TeamMemberGalleryPhoto[]> {
      const { data, error } = await table()
        .select("*")
        .eq("profile_id", profileId)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) {
        throw new Error(`Failed to list gallery photos: ${error.message}`);
      }
      return (data ?? []).map((row) =>
        rowToGalleryPhoto(row as Record<string, unknown>)
      );
    },

    async create(input: {
      profile_id: string;
      storage_key: string;
      title?: string | null;
      alt_text?: string | null;
      copyright?: string | null;
      sort_order?: number;
    }): Promise<TeamMemberGalleryPhoto> {
      const now = new Date().toISOString();
      const row = {
        id: uuidv7(),
        tenant_id: tenantId,
        scope_id: scopeId,
        profile_id: input.profile_id,
        storage_key: input.storage_key,
        title: input.title ?? null,
        alt_text: input.alt_text ?? null,
        copyright: input.copyright ?? null,
        sort_order: input.sort_order ?? 0,
        created_at: now,
        updated_at: now,
      };

      const { data, error } = await table().insert(row).select().single();
      if (error) {
        throw new Error(`Failed to create gallery photo: ${error.message}`);
      }
      return rowToGalleryPhoto((data ?? row) as Record<string, unknown>);
    },

    async update(
      id: string,
      patch: {
        title?: string | null;
        alt_text?: string | null;
        copyright?: string | null;
        sort_order?: number;
      }
    ): Promise<TeamMemberGalleryPhoto | null> {
      const { data, error } = await table()
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .select()
        .maybeSingle();

      if (error) {
        throw new Error(`Failed to update gallery photo: ${error.message}`);
      }
      return data ? rowToGalleryPhoto(data as Record<string, unknown>) : null;
    },

    async getById(id: string): Promise<TeamMemberGalleryPhoto | null> {
      const { data, error } = await table()
        .select("*")
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .maybeSingle();

      if (error || !data) {
        return null;
      }
      return rowToGalleryPhoto(data as Record<string, unknown>);
    },

    async delete(id: string): Promise<boolean> {
      const { error } = await table()
        .delete()
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId);

      if (error) {
        throw new Error(`Failed to delete gallery photo: ${error.message}`);
      }
      return true;
    },
  };
}
