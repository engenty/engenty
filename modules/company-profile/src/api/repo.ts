import type { PluginAuthContext } from "@engenty/plugin-sdk";
import type { CompanyProfileRepoSupabase } from "../dal/index.js";

export type RepoOrFactory =
  | CompanyProfileRepoSupabase
  | ((auth: PluginAuthContext) => CompanyProfileRepoSupabase);

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
