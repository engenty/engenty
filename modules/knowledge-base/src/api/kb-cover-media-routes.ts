/**
 * Cover media for knowledge bases and their categories: the shared cover
 * routes (`@engenty/covers/server`) under `/api/kb/cover`, storing into the
 * KB's own folder.
 */
import { registerCoverMediaRoutes } from "@engenty/covers/server";
import type { PluginAuthContext, PluginServerApi } from "@engenty/plugin-sdk";
import type { KbRepoFactory } from "../dal/contracts.js";
import { isKbStorageKey, kbStorageKey } from "../lib/kb-storage-key.js";

export function registerKbCoverMediaRoutes(
  api: Pick<PluginServerApi, "getStorageService" | "registerHttpRoute">,
  getRepo: (auth?: PluginAuthContext) => KbRepoFactory
) {
  registerCoverMediaRoutes(api, {
    basePath: "/api/kb/cover",
    notFoundMessage: "Knowledge base not found",
    ownerField: "kb_id",
    resolveOwner: async (auth, kbId) => {
      const kb = await getRepo(auth).kb.getById(kbId);
      return kb
        ? {
            isOwnKey: (key) => isKbStorageKey(kb, key),
            storageKey: (...segments) => kbStorageKey(kb, ...segments),
          }
        : null;
    },
  });
}
