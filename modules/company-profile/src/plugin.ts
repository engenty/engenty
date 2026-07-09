import {
  createPluginServerGatewayCaller,
  type EngentyPluginFactory,
} from "@engenty/plugin-sdk";
import { companyProfileAiRegistration } from "../ai/registrar.js";
import { registerCompanyProfileApi } from "./api/index.js";
import { createCompanyProfileRepoSupabase } from "./dal/index.js";

const registerCompanyProfilePlugin: EngentyPluginFactory = (engenty) => {
  // Phase 5 — role bundles (named capability bundles assignable to users/agents).
  engenty.server.registerRoleProfiles([
    {
      id: "company-profile.viewer",
      title: "Company profile viewer",
      capabilities: ["module.company-profile.read"],
    },
    {
      id: "company-profile.editor",
      title: "Company profile editor",
      capabilities: [
        "module.company-profile.read",
        "module.company-profile.write",
      ],
    },
  ]);
  const supabase = engenty.server.getDatabaseAdapter?.() ?? null;
  if (!supabase) {
    return;
  }
  const repoOrFactory = (auth: { tenantId: string; scopeId: string }) =>
    createCompanyProfileRepoSupabase(supabase, auth.tenantId, auth.scopeId);
  const { invokeOperation } = createPluginServerGatewayCaller(engenty.server);
  engenty.server.registerAiRegistration(
    companyProfileAiRegistration({
      invokeCompanyProfileOperation: invokeOperation,
    })
  );
  registerCompanyProfileApi(engenty.server, repoOrFactory);
};

export default registerCompanyProfilePlugin;
