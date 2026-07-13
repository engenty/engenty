import type { PluginAuthContext, PluginServerApi } from "@engenty/plugin-sdk";
import { assertTeamMemberPhotoStorageKey } from "@engenty/team/photos";
import { z } from "@hono/zod-openapi";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { createTeamMemberContractsRepoSupabase } from "../dal/contracts-supabase.js";
import type { createTeamMemberGalleryPhotosRepoSupabase } from "../dal/photos-supabase.js";
import {
  notFoundSchema,
  teamMemberGalleryPhotoCreateSchema,
  teamMemberGalleryPhotoSchema,
  teamMemberGalleryPhotoUpdateSchema,
  teamMemberIdParamsSchema,
} from "../schema/hr-records.js";

type ContractsRepo = ReturnType<typeof createTeamMemberContractsRepoSupabase>;
type GalleryPhotosRepo = ReturnType<
  typeof createTeamMemberGalleryPhotosRepoSupabase
>;
type ContractsRepoOrFactory =
  | ContractsRepo
  | ((auth: PluginAuthContext) => ContractsRepo);
type GalleryPhotosRepoOrFactory =
  | GalleryPhotosRepo
  | ((auth: PluginAuthContext) => GalleryPhotosRepo);

function getContractsRepo(
  repoOrFactory: ContractsRepoOrFactory,
  auth?: PluginAuthContext
): ContractsRepo | null {
  if (typeof repoOrFactory === "function") {
    return auth ? repoOrFactory(auth) : null;
  }
  return repoOrFactory;
}

function getGalleryPhotosRepo(
  repoOrFactory: GalleryPhotosRepoOrFactory,
  auth?: PluginAuthContext
): GalleryPhotosRepo | null {
  if (typeof repoOrFactory === "function") {
    return auth ? repoOrFactory(auth) : null;
  }
  return repoOrFactory;
}

/** Whether a member profile exists in this tenant/scope (team owns profiles). */
async function profileExists(
  supabase: unknown,
  auth: PluginAuthContext | undefined,
  profileId: string
): Promise<boolean> {
  if (!auth?.tenantId) {
    throw new Error("Tenant required");
  }
  const scopeId = auth.scopeId || "default";
  const { data } = await (supabase as SupabaseClient)
    .schema("module_team")
    .from("profiles")
    .select("id")
    .eq("id", profileId)
    .eq("tenant_id", auth.tenantId)
    .eq("scope_id", scopeId)
    .maybeSingle();
  return Boolean(data);
}

const memberNotFound = () =>
  new Response(JSON.stringify({ error: "Team member not found" }), {
    status: 404,
    headers: { "content-type": "application/json" },
  });

/**
 * Contract + employment-gallery routes for a team member, keyed by the member's
 * profile id. team-hr owns these; the file bytes live in the module-team-contracts
 * (contracts) and file-storage (gallery) vaults.
 */
export function registerTeamHrContractGalleryRoutes(
  server: Pick<PluginServerApi, "registerHttpRoute">,
  supabase: unknown,
  repos: {
    contractsRepoOrFactory: ContractsRepoOrFactory;
    galleryPhotosRepoOrFactory: GalleryPhotosRepoOrFactory;
  }
) {
  const { contractsRepoOrFactory, galleryPhotosRepoOrFactory } = repos;

  server.registerHttpRoute({
    method: "get",
    path: "/api/team/:id/contracts",
    operation: {
      moduleId: "team-hr",
      requiredCapabilities: ["module.team-hr.read"],
      riskLevel: "low",
      idempotent: true,
    },
    summary: "List contracts for team member",
    tags: ["team-hr", "contracts"],
    request: { params: teamMemberIdParamsSchema },
    responses: {
      200: {
        description: "Contracts list",
        schema: z.object({ data: z.array(z.any()) }),
      },
    },
    handler: async (ctx) => {
      const contractsRepo = getContractsRepo(contractsRepoOrFactory, ctx.auth);
      if (!contractsRepo) {
        throw new Error("Contracts repo not available");
      }
      const params = ctx.params as z.infer<typeof teamMemberIdParamsSchema>;
      const data = await contractsRepo.listByProfileId(params.id);
      return { data };
    },
  });

  server.registerHttpRoute({
    method: "post",
    path: "/api/team/:id/contracts",
    operation: {
      moduleId: "team-hr",
      requiredCapabilities: ["module.team-hr.write"],
      riskLevel: "high",
      requiresApproval: true,
    },
    summary: "Upload contract for team member",
    tags: ["team-hr", "contracts"],
    request: { params: teamMemberIdParamsSchema },
    responses: {
      201: { description: "Contract uploaded", schema: z.any() },
      404: { description: "Team member not found" },
    },
    handler: async (ctx) => {
      const contractsRepo = getContractsRepo(contractsRepoOrFactory, ctx.auth);
      if (!contractsRepo) {
        throw new Error("Contracts repo not available");
      }
      const params = ctx.params as z.infer<typeof teamMemberIdParamsSchema>;

      if (!(await profileExists(supabase, ctx.auth, params.id))) {
        return memberNotFound();
      }

      const formData = await ctx.request.formData();
      const file = formData.get("file") as File | null;
      if (!(file && file instanceof Blob)) {
        return new Response(JSON.stringify({ error: "No file provided" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }

      const allowed = [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ];
      if (!allowed.includes(file.type)) {
        return new Response(
          JSON.stringify({
            error: "Invalid file type. Allowed: PDF, DOC, DOCX",
          }),
          { status: 400, headers: { "content-type": "application/json" } }
        );
      }

      const buffer = await file.arrayBuffer();
      const principalId = ctx.auth?.principalId ?? "unknown";
      const contract = await contractsRepo.add(
        params.id,
        { name: file.name, data: buffer, size: file.size },
        principalId
      );
      return new Response(JSON.stringify(contract), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    },
  });

  server.registerHttpRoute({
    method: "delete",
    path: "/api/team/:teamMemberId/contracts/:contractId",
    operation: {
      moduleId: "team-hr",
      requiredCapabilities: ["module.team-hr.write"],
      riskLevel: "high",
      requiresApproval: true,
    },
    summary: "Delete contract",
    tags: ["team-hr", "contracts"],
    request: {
      params: z.object({
        teamMemberId: z.string().min(1),
        contractId: z.string().min(1),
      }),
    },
    responses: {
      200: { description: "Deleted", schema: z.object({ ok: z.boolean() }) },
      404: { description: "Not found" },
    },
    handler: async (ctx) => {
      const contractsRepo = getContractsRepo(contractsRepoOrFactory, ctx.auth);
      if (!contractsRepo) {
        throw new Error("Contracts repo not available");
      }
      const params = ctx.params as {
        teamMemberId: string;
        contractId: string;
      };
      const ok = await contractsRepo.delete(params.contractId);
      if (!ok) {
        return new Response(JSON.stringify({ error: "Contract not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      return { ok: true };
    },
  });

  server.registerHttpRoute({
    method: "get",
    path: "/api/team/:id/gallery-photos",
    operation: {
      moduleId: "team-hr",
      requiredCapabilities: ["module.team-hr.read"],
      riskLevel: "low",
      idempotent: true,
    },
    summary: "List gallery photos for team member",
    tags: ["team-hr", "photos"],
    request: { params: teamMemberIdParamsSchema },
    responses: {
      200: {
        description: "Gallery photos list",
        schema: z.object({ data: z.array(teamMemberGalleryPhotoSchema) }),
      },
    },
    handler: async (ctx) => {
      const photosRepo = getGalleryPhotosRepo(
        galleryPhotosRepoOrFactory,
        ctx.auth
      );
      if (!photosRepo) {
        throw new Error("Gallery photos repo not available");
      }
      const params = ctx.params as z.infer<typeof teamMemberIdParamsSchema>;
      const data = await photosRepo.listByProfileId(params.id);
      return { data };
    },
  });

  server.registerHttpRoute({
    method: "post",
    path: "/api/team/:id/gallery-photos",
    operation: {
      moduleId: "team-hr",
      requiredCapabilities: ["module.team-hr.write"],
      riskLevel: "high",
      requiresApproval: true,
    },
    summary: "Create gallery photo metadata for team member",
    tags: ["team-hr", "photos"],
    request: {
      params: teamMemberIdParamsSchema,
      body: teamMemberGalleryPhotoCreateSchema,
    },
    responses: {
      201: {
        description: "Gallery photo created",
        schema: teamMemberGalleryPhotoSchema,
      },
      404: { description: "Team member not found", schema: notFoundSchema },
    },
    handler: async (ctx) => {
      const photosRepo = getGalleryPhotosRepo(
        galleryPhotosRepoOrFactory,
        ctx.auth
      );
      if (!photosRepo) {
        throw new Error("Gallery photos repo not available");
      }
      const params = ctx.params as z.infer<typeof teamMemberIdParamsSchema>;
      const body = ctx.body as z.infer<
        typeof teamMemberGalleryPhotoCreateSchema
      >;

      if (!(await profileExists(supabase, ctx.auth, params.id))) {
        return memberNotFound();
      }

      const tenantId = ctx.auth?.tenantId;
      if (!tenantId) {
        throw new Error("Tenant required");
      }

      try {
        assertTeamMemberPhotoStorageKey({
          storage_key: body.storage_key,
          tenant_id: tenantId,
          profile_id: params.id,
          kind: "gallery",
        });
      } catch {
        return new Response(
          JSON.stringify({ error: "Invalid gallery photo storage key" }),
          { status: 400, headers: { "content-type": "application/json" } }
        );
      }

      const created = await photosRepo.create({
        profile_id: params.id,
        storage_key: body.storage_key,
        title: body.title ?? null,
        alt_text: body.alt_text ?? null,
        copyright: body.copyright ?? null,
        sort_order: body.sort_order,
      });
      return new Response(JSON.stringify(created), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    },
  });

  server.registerHttpRoute({
    method: "patch",
    path: "/api/team/:id/gallery-photos/:photoId",
    operation: {
      moduleId: "team-hr",
      requiredCapabilities: ["module.team-hr.write"],
      riskLevel: "medium",
      requiresApproval: true,
    },
    summary: "Update gallery photo metadata",
    tags: ["team-hr", "photos"],
    request: {
      params: z.object({
        id: z.string().min(1),
        photoId: z.string().min(1),
      }),
      body: teamMemberGalleryPhotoUpdateSchema,
    },
    responses: {
      200: {
        description: "Gallery photo updated",
        schema: teamMemberGalleryPhotoSchema,
      },
      404: { description: "Not found", schema: notFoundSchema },
    },
    handler: async (ctx) => {
      const photosRepo = getGalleryPhotosRepo(
        galleryPhotosRepoOrFactory,
        ctx.auth
      );
      if (!photosRepo) {
        throw new Error("Gallery photos repo not available");
      }
      const params = ctx.params as { id: string; photoId: string };
      const body = ctx.body as z.infer<
        typeof teamMemberGalleryPhotoUpdateSchema
      >;

      const existing = await photosRepo.getById(params.photoId);
      if (!existing || existing.profile_id !== params.id) {
        return new Response(
          JSON.stringify({ error: "Gallery photo not found" }),
          { status: 404, headers: { "content-type": "application/json" } }
        );
      }

      const updated = await photosRepo.update(params.photoId, body);
      if (!updated) {
        return new Response(
          JSON.stringify({ error: "Gallery photo not found" }),
          { status: 404, headers: { "content-type": "application/json" } }
        );
      }
      return updated;
    },
  });

  server.registerHttpRoute({
    method: "delete",
    path: "/api/team/:id/gallery-photos/:photoId",
    operation: {
      moduleId: "team-hr",
      requiredCapabilities: ["module.team-hr.write"],
      riskLevel: "high",
      requiresApproval: true,
    },
    summary: "Delete gallery photo metadata",
    tags: ["team-hr", "photos"],
    request: {
      params: z.object({
        id: z.string().min(1),
        photoId: z.string().min(1),
      }),
    },
    responses: {
      200: { description: "Deleted", schema: z.object({ ok: z.boolean() }) },
      404: { description: "Not found", schema: notFoundSchema },
    },
    handler: async (ctx) => {
      const photosRepo = getGalleryPhotosRepo(
        galleryPhotosRepoOrFactory,
        ctx.auth
      );
      if (!photosRepo) {
        throw new Error("Gallery photos repo not available");
      }
      const params = ctx.params as { id: string; photoId: string };

      const existing = await photosRepo.getById(params.photoId);
      if (!existing || existing.profile_id !== params.id) {
        return new Response(
          JSON.stringify({ error: "Gallery photo not found" }),
          { status: 404, headers: { "content-type": "application/json" } }
        );
      }

      await photosRepo.delete(params.photoId);
      return { ok: true };
    },
  });
}
