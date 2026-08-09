import {
  capabilityCovers,
  createPluginServerGatewayCaller,
  type EngentyPluginFactory,
} from "@engenty/plugin-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { projectsAiRegistration } from "../ai/registrar.js";
import { registerProjectsApi } from "./api/index.js";
import { createPortalDAL } from "./dal/portal-supabase.js";
import { createProjectRepoSupabase } from "./dal/supabase.js";
import { createProjectVisibilityPolicy } from "./policies.js";

const registerProjectsPlugin: EngentyPluginFactory = (engenty) => {
  const { server } = engenty;
  // Phase A seam (PLAN-tenant-isolation-a-rls-seam.md): request-shaped work runs on
  // tenant-locked handles (engenty_server lane, RLS-enforced). The service client
  // remains ONLY for the portal's context-less project-row lookups, which resolve
  // tenancy themselves (anonymous visitor + projectId from a public URL).
  const serviceDb = (server.getServiceDb?.() ?? null) as SupabaseClient | null;
  const getTenantDb = server.getTenantDb;
  if (!(serviceDb && getTenantDb)) {
    return;
  }
  const getDb = (auth: { tenantId: string }) =>
    getTenantDb(auth) as SupabaseClient;

  const { invokeOperation } = createPluginServerGatewayCaller(server);

  const repoOrFactory = (
    auth: {
      tenantId: string;
      scopeId: string;
      principalId: string;
      capabilities?: string[];
    },
    recordAuditEvent?: (event: {
      type: string;
      detail?: Record<string, unknown>;
    }) => void
  ) =>
    createProjectRepoSupabase(getDb(auth), auth.tenantId, auth.scopeId, {
      invokeTasks: (operationId, input) =>
        invokeOperation(operationId, input, { auth }),
      audit: recordAuditEvent ? { recordAuditEvent } : undefined,
      // A caller who holds module.projects.moderate (or a broader wildcard)
      // sees every project; everyone else is filtered to visible ones.
      viewer: {
        userId: auth.principalId,
        seesAllProjects: capabilityCovers(
          auth.capabilities ?? [],
          "module.projects.moderate"
        ),
      },
    });
  const portalDAL = createPortalDAL(serviceDb, { getDb, invokeOperation });
  server.registerAiRegistration(
    projectsAiRegistration({ invokeProjectsOperation: invokeOperation })
  );

  // Phase 2 — project visibility: deny per-project operations on members-only
  // projects to non-members (admins/moderators bypass). List visibility is
  // additionally filtered in the DAL; this gates direct project access.
  // Cast mirrors the previous `supabase as never`: the SupabaseClient satisfies
  // the policy's minimal VisibilityDb shape, but its thenable builders aren't
  // structural Promises.
  server.registerProfilePolicy(createProjectVisibilityPolicy(getDb as never));
  // Role bundles contributed by the projects module.
  server.registerRoleProfiles([
    {
      id: "projects.viewer",
      title: "Projects viewer",
      capabilities: ["module.projects.read"],
    },
    {
      id: "projects.editor",
      title: "Projects editor",
      capabilities: ["module.projects.read", "module.projects.write"],
    },
    {
      id: "projects.lead",
      title: "Project lead",
      capabilities: [
        "module.projects.read",
        "module.projects.write",
        "module.projects.moderate",
      ],
    },
  ]);

  registerProjectsApi(server, repoOrFactory, {
    portalDAL,
  });
};

export default registerProjectsPlugin;
