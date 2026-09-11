import {
  createRecordLinker,
  type PluginServerApi,
  type RecordLinkAuth,
  withRecordLink,
  withRecordLinks,
} from "@engenty/plugin-sdk";
import { z } from "@hono/zod-openapi";
import {
  projectCreateInputSchema,
  projectIdParamsSchema,
  projectSchema,
  projectSettingsInputSchema,
  projectSettingsSchema,
  projectsListQuerySchema,
  projectsPaginatedResponseSchema,
  projectUpdateSchema,
} from "../schema/zod.js";
import { registerProjectsPhaseTaskGatewayMethods } from "./gateway-phase-task-methods.js";
import { getRepo, projectsOp, type RepoOrFactory } from "./gateway-shared.js";
import {
  PROJECTS_COLLECTION_SPACE_POLICY,
  PROJECTS_SETTINGS_SPACE_POLICY,
  projectsRecordSpacePolicy,
} from "./operation-space-policy.js";

const projectRecordPolicy = projectsRecordSpacePolicy("id");

export function registerProjectsGatewayMethods(
  api: PluginServerApi,
  repoOrFactory: RepoOrFactory
) {
  // A project lives in its own space; the link follows the record, not the run.
  const link = createRecordLinker(api);
  const projectLink = (
    auth: RecordLinkAuth | undefined,
    project: { id: string; space_id?: string | null }
  ) => link(auth, "projects", [project.id], project.space_id);

  api.registerOperation({
    operationId: "projects_list",
    summary: "List projects",
    ...projectsOp(true),
    spacePolicy: PROJECTS_COLLECTION_SPACE_POLICY,
    inputSchema: projectsListQuerySchema.partial(),
    outputSchema: projectsPaginatedResponseSchema,
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const parsed = projectsListQuerySchema.parse(input ?? {});
      const result = await repo.listPaginated(parsed);
      return {
        ...result,
        data: await withRecordLinks(result.data, (project) =>
          projectLink(ctx.auth, project)
        ),
      };
    },
  });

  api.registerOperation({
    operationId: "projects_get",
    summary: "Get project by ID",
    ...projectsOp(true),
    spacePolicy: projectRecordPolicy,
    inputSchema: projectIdParamsSchema,
    outputSchema: z.any(),
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const params = input as z.infer<typeof projectIdParamsSchema>;
      const project = await repo.getByIdWithPhasesAndTasks(params.id);
      return project
        ? withRecordLink(project, (row) => projectLink(ctx.auth, row))
        : project;
    },
  });

  api.registerOperation({
    operationId: "projects_create",
    summary: "Create project",
    ...projectsOp(false),
    spacePolicy: PROJECTS_COLLECTION_SPACE_POLICY,
    inputSchema: projectCreateInputSchema,
    outputSchema: projectSchema,
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const raw = input as z.infer<typeof projectCreateInputSchema>;
      const full = {
        ...raw,
        client_id: raw.client_id ?? null,
        client_name: raw.client_name ?? null,
        briefing: raw.briefing ?? null,
        start_date: raw.start_date ?? null,
        end_date: raw.end_date ?? null,
        lead_id: raw.lead_id ?? null,
        portal_enabled: raw.portal_enabled ?? false,
        portal_password: raw.portal_password ?? null,
        portal_intro_text: raw.portal_intro_text ?? null,
        created_by: raw.created_by ?? null,
        ...(raw.team_member_ids === undefined
          ? {}
          : { team_member_ids: raw.team_member_ids }),
      };
      return withRecordLink(await repo.create(full), (project) =>
        projectLink(ctx.auth, project)
      );
    },
  });

  api.registerOperation({
    operationId: "projects_update",
    summary: "Update project",
    ...projectsOp(false),
    spacePolicy: projectRecordPolicy,
    inputSchema: z.object({
      id: z.string().min(1),
      patch: projectUpdateSchema,
    }),
    outputSchema: projectSchema.nullable(),
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const { id, patch } = input as {
        id: string;
        patch: z.infer<typeof projectUpdateSchema>;
      };
      const updated = await repo.update(id, patch);
      return updated
        ? withRecordLink(updated, (project) => projectLink(ctx.auth, project))
        : updated;
    },
  });

  api.registerOperation({
    operationId: "projects_delete",
    summary: "Delete project",
    ...projectsOp(false),
    spacePolicy: projectRecordPolicy,
    riskLevel: "critical" as const,
    inputSchema: projectIdParamsSchema.extend({
      delete_tasks: z.boolean().optional(),
    }),
    outputSchema: z.object({ deleted: z.boolean() }),
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const params = input as z.infer<typeof projectIdParamsSchema> & {
        delete_tasks?: boolean;
      };
      const deleted = await repo.delete(params.id, {
        deleteTasks: params.delete_tasks,
      });
      return { deleted };
    },
  });

  api.registerOperation({
    operationId: "projects_settings_get",
    summary: "Get project settings",
    ...projectsOp(true),
    spacePolicy: PROJECTS_SETTINGS_SPACE_POLICY,
    inputSchema: z.object({}).passthrough(),
    outputSchema: projectSettingsSchema,
    handler: async (_input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      return repo.getSettings();
    },
  });

  api.registerOperation({
    operationId: "projects_settings_update",
    summary: "Update project settings",
    ...projectsOp(false),
    spacePolicy: PROJECTS_SETTINGS_SPACE_POLICY,
    inputSchema: projectSettingsInputSchema,
    outputSchema: projectSettingsSchema,
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      return repo.setSettings(
        input as z.infer<typeof projectSettingsInputSchema>
      );
    },
  });

  registerProjectsPhaseTaskGatewayMethods(api, repoOrFactory);
}
