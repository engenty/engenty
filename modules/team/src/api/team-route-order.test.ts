import { describe, expect, it } from "vitest";
import { registerTeamHabboAvatarRoutes } from "./habbo-avatar-routes.js";
import { registerTeamImportRoutes } from "./import-routes.js";
import { registerTeamMembersApi } from "./index.js";
import { registerTeamModuleRoutes } from "./team-module-routes.js";
import { makeMockApi, makeMockTeamMemberRepo } from "./test-helpers.js";

/** Mirrors plugin.ts registration order — module routes must precede /api/team/:id. */
function registerTeamRoutesLikePlugin(
  api: ReturnType<typeof makeMockApi>["api"],
  supabase: unknown
) {
  registerTeamModuleRoutes(api, supabase);
  registerTeamHabboAvatarRoutes(api);
  registerTeamImportRoutes(api);
  registerTeamMembersApi(api, makeMockTeamMemberRepo());
}

describe("team plugin HTTP route order", () => {
  const staticGetPaths = [
    "/api/team/member-field-definitions",
    "/api/team/settings",
    "/api/team/org",
    "/api/team/org/graph",
    "/api/team/taxonomies",
    "/api/team/groups",
    "/api/team/taxonomies/filter-options",
  ] as const;

  it("registers module static routes before GET /api/team/:id", () => {
    const { api, httpRoutes } = makeMockApi();
    registerTeamRoutesLikePlugin(api, {});

    const memberByIdIdx = httpRoutes.findIndex(
      (r) => r.method === "get" && r.path === "/api/team/:id"
    );
    expect(memberByIdIdx).toBeGreaterThan(-1);

    for (const path of staticGetPaths) {
      const idx = httpRoutes.findIndex(
        (r) => r.method === "get" && r.path === path
      );
      expect(idx, `missing route GET ${path}`).toBeGreaterThan(-1);
      expect(idx).toBeLessThan(memberByIdIdx);
    }
  });

  it("registers Habbo avatar route before GET /api/team/:id", () => {
    const { api, httpRoutes } = makeMockApi();
    registerTeamRoutesLikePlugin(api, {});

    const memberByIdIdx = httpRoutes.findIndex(
      (r) => r.method === "get" && r.path === "/api/team/:id"
    );
    const idx = httpRoutes.findIndex(
      (r) => r.method === "post" && r.path === "/api/team/avatars/habbo"
    );
    expect(idx).toBeGreaterThan(-1);
    expect(idx).toBeLessThan(memberByIdIdx);
  });

  it("registers import lookup routes before GET /api/team/:id", () => {
    const { api, httpRoutes } = makeMockApi();
    registerTeamRoutesLikePlugin(api, {});

    const memberByIdIdx = httpRoutes.findIndex(
      (r) => r.method === "get" && r.path === "/api/team/:id"
    );
    for (const path of [
      "/api/team/by-import-id",
      "/api/team/by-email",
    ] as const) {
      const idx = httpRoutes.findIndex(
        (r) => r.method === "get" && r.path === path
      );
      expect(idx, `missing route GET ${path}`).toBeGreaterThan(-1);
      expect(idx).toBeLessThan(memberByIdIdx);
    }
  });
});
