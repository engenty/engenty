import {
  createPluginServerGatewayCaller,
  type EngentyPluginFactory,
} from "@engenty/plugin-sdk";
import { companyProfileAiRegistration } from "../ai/registrar.js";
import { registerCompanyProfileApi } from "./api/index.js";
import { createCompanyProfileRepoSupabase } from "./dal/index.js";

const registerCompanyProfilePlugin: EngentyPluginFactory = (engenty) => {
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
