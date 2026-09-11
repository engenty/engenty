import type {
  PluginAuthContext,
  PluginHttpRouteContext,
} from "@engenty/plugin-sdk";
import type { createProjectRepoSupabase } from "../dal/supabase.js";

type ProjectRepo = ReturnType<typeof createProjectRepoSupabase>;

export type RepoOrFactory =
  | ProjectRepo
  | ((
      auth: PluginAuthContext,
      recordAuditEvent?: PluginHttpRouteContext["recordAuditEvent"]
    ) => ProjectRepo);

export function getRepo(
  repoOrFactory: RepoOrFactory,
  auth?: PluginAuthContext,
  recordAuditEvent?: PluginHttpRouteContext["recordAuditEvent"]
): ProjectRepo {
  if (typeof repoOrFactory === "function") {
    if (!auth) {
      throw new Error("Auth context required");
    }
    return repoOrFactory(auth, recordAuditEvent);
  }
  return repoOrFactory;
}

export const projectsOp = (read: boolean) => ({
  dryRunSupported: false,
  idempotent: read,
  moduleId: "projects",
  requiredCapabilities: [
    read ? "module.projects.read" : "module.projects.write",
  ],
  requiresApproval: !read,
  riskLevel: read ? ("low" as const) : ("high" as const),
});
