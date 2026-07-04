import type { PluginAuthContext } from "@engenty/plugin-sdk";
import type { CommercialSettingsRepoSupabase } from "../dal/index.js";

export type RepoOrFactory =
  | CommercialSettingsRepoSupabase
  | ((auth: PluginAuthContext) => CommercialSettingsRepoSupabase);

export function getRepo(
  repoOrFactory: RepoOrFactory,
  auth?: PluginAuthContext
) {
  if (typeof repoOrFactory === "function") {
    if (!auth) {
      throw new Error("Auth context required");
    }
    return repoOrFactory(auth);
  }
  return repoOrFactory;
}
