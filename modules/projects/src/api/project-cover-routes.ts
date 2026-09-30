/**
 * Cover media for projects: the shared cover routes (`@engenty/covers/server`)
 * under `/api/projects/cover`, storing into the project's folder in its space.
 */
import { registerCoverMediaRoutes } from "@engenty/covers/server";
import { fileStorageSpaceObjectKey } from "@engenty/file-storage";
import type { PluginServerApi } from "@engenty/plugin-sdk";
import { getRepo, type RepoOrFactory } from "./gateway-shared.js";

/** File-storage folder for project-owned objects inside a space. */
const PROJECTS_STORAGE_FOLDER = "projects";

export function registerProjectCoverRoutes(
  api: Pick<PluginServerApi, "getStorageService" | "registerHttpRoute">,
  repoOrFactory: RepoOrFactory
) {
  registerCoverMediaRoutes(api, {
    basePath: "/api/projects/cover",
    notFoundMessage: "Project not found",
    ownerField: "project_id",
    resolveOwner: async (auth, projectId) => {
      const project = await getRepo(repoOrFactory, auth).getById(projectId);
      if (!project) {
        return null;
      }
      const storageKey = (...segments: string[]) =>
        fileStorageSpaceObjectKey(
          project.tenant_id,
          project.space_id,
          PROJECTS_STORAGE_FOLDER,
          project.id,
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
