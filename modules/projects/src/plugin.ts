import {
  createPluginServerGatewayCaller,
  type EngentyPluginFactory,
} from "@engenty/plugin-sdk";
import { projectsAiRegistration } from "../ai/registrar.js";
import { registerProjectsApi } from "./api/index.js";
import { createPortalDAL } from "./dal/portal-supabase.js";
import { createProjectRepoSupabase } from "./dal/supabase.js";

const registerProjectsPlugin: EngentyPluginFactory = (engenty) => {
  const { server } = engenty;
  const supabase = server.getDatabaseAdapter?.() ?? null;
  if (!supabase) {
    return;
  }

  const { invokeOperation } = createPluginServerGatewayCaller(server);

  const repoOrFactory = (
    auth: { tenantId: string; scopeId: string; principalId: string },
    recordAuditEvent?: (event: {
      type: string;
      detail?: Record<string, unknown>;
    }) => void
  ) =>
    createProjectRepoSupabase(supabase, auth.tenantId, auth.scopeId, {
      invokeTasks: (operationId, input) =>
        invokeOperation(operationId, input, { auth }),
      audit: recordAuditEvent ? { recordAuditEvent } : undefined,
    });
  const portalDAL = createPortalDAL(supabase, { invokeOperation });
  server.registerAiRegistration(
    projectsAiRegistration({ invokeProjectsOperation: invokeOperation })
  );

  registerProjectsApi(server, repoOrFactory, {
    portalDAL,
    supabase: supabase as never,
  });
};

export default registerProjectsPlugin;
