/**
 * Cover images for a space's home header: the shared cover routes
 * (`@engenty/covers/server`) under `/api/files/space-cover` — upload, Unsplash
 * and AI — storing into the space's own storage. Choosing the cover is core's
 * `PATCH /api/spaces/:spaceId/details`; these routes only produce the image.
 *
 * A caller may produce an image for a space it can open: an open space in its
 * tenant, or a private one it is a member of.
 */
import { registerCoverMediaRoutes } from "@engenty/covers/server";
import { fileStorageSpaceObjectKey } from "@engenty/file-storage";
import {
  actorUserIdFromAuth,
  type PluginAuthContext,
  type PluginServerApi,
} from "@engenty/plugin-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Storage folder for the space's cover images. */
const SPACE_COVER_FOLDER = "covers";

async function canOpenSpace(
  db: SupabaseClient,
  auth: PluginAuthContext,
  spaceId: string
): Promise<boolean> {
  const space = await db
    .schema("core")
    .from("spaces")
    .select("visibility")
    .eq("tenant_id", auth.tenantId)
    .eq("id", spaceId)
    .is("deleted_at", null)
    .maybeSingle();
  if (space.error || !space.data) {
    return false;
  }
  if ((space.data as { visibility: string }).visibility !== "private") {
    return true;
  }
  const userId = actorUserIdFromAuth(auth);
  if (!userId) {
    return auth.spaceId === spaceId;
  }
  const member = await db
    .schema("core")
    .from("space_member")
    .select("space_id")
    .eq("tenant_id", auth.tenantId)
    .eq("space_id", spaceId)
    .eq("user_id", userId)
    .maybeSingle();
  return !member.error && Boolean(member.data);
}

export function registerSpaceCoverRoutes(
  api: Pick<PluginServerApi, "getStorageService" | "registerHttpRoute">,
  getDb: (auth: { tenantId: string }) => SupabaseClient
) {
  registerCoverMediaRoutes(api, {
    basePath: "/api/files/space-cover",
    notFoundMessage: "Space not found",
    ownerField: "space_id",
    resolveOwner: async (auth, spaceId) => {
      if (!(await canOpenSpace(getDb(auth), auth, spaceId))) {
        return null;
      }
      const storageKey = (...segments: string[]) =>
        fileStorageSpaceObjectKey(
          auth.tenantId,
          spaceId,
          SPACE_COVER_FOLDER,
          ...segments
        );
      const prefix = `${storageKey()}/`;
      return {
        isOwnKey: (key) => key.startsWith(prefix),
        storageKey,
      };
    },
  });
}
