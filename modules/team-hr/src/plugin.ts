import type { EngentyPluginFactory } from "@engenty/plugin-sdk";
import { registerTeamHrContractGalleryRoutes } from "./api/contracts-gallery-routes.js";
import { registerEmployeeRoutes } from "./api/employee-routes.js";
import { registerEmploymentTimeRoutes } from "./api/employment-time-routes.js";
import { createTeamMemberContractsRepoSupabase } from "./dal/contracts-supabase.js";
import { createTeamMemberGalleryPhotosRepoSupabase } from "./dal/photos-supabase.js";

/**
 * team-hr server surface. Owns the entire HR/employment vertical for a team member,
 * keyed by the member's profile id: the employee (HR) record, contracts, gallery
 * photos, and the employment-time routes. Core team's member API is profile-only;
 * the FK direction is team-hr -> team, so core runs without this module.
 */
const registerTeamHrPlugin: EngentyPluginFactory = (engenty) => {
  const supabase = engenty.server.getDatabaseAdapter?.() ?? null;
  if (!supabase) {
    return;
  }

  const contractsRepoOrFactory = (auth: {
    tenantId: string;
    scopeId: string;
  }) =>
    createTeamMemberContractsRepoSupabase(
      supabase,
      auth.tenantId,
      auth.scopeId
    );
  const galleryPhotosRepoOrFactory = (auth: {
    tenantId: string;
    scopeId: string;
  }) =>
    createTeamMemberGalleryPhotosRepoSupabase(
      supabase,
      auth.tenantId,
      auth.scopeId
    );

  registerEmployeeRoutes(engenty.server, supabase);
  registerEmploymentTimeRoutes(engenty.server, supabase);
  registerTeamHrContractGalleryRoutes(engenty.server, supabase, {
    contractsRepoOrFactory,
    galleryPhotosRepoOrFactory,
  });

  engenty.server.registerFeatureFlags([
    {
      key: "team.hr.enabled",
      namespace: "team-hr",
      default: true,
      labelKey: "team-hr:featureFlags.hr.enabled",
      pluginId: "team-hr",
    },
  ]);
};

export default registerTeamHrPlugin;
