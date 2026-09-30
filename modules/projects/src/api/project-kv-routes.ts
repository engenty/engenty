/**
 * Project KV over HTTP — the same routes as `/api/user-settings`, under the
 * project: list, get, set (typed value) and delete by name. A project the
 * caller cannot see answers 404, so its keys are as visible as the project.
 */
import type { PluginAuthContext, PluginServerApi } from "@engenty/plugin-sdk";
import { z } from "@hono/zod-openapi";
import type { ProjectKvRepo } from "../dal/project-kv.js";
import {
  notFoundSchema,
  projectKvEntrySchema,
  projectKvListResponseSchema,
  projectKvSetRequestSchema,
} from "../schema/zod.js";
import { getRepo, projectsOp, type RepoOrFactory } from "./gateway-shared.js";

const kvParams = z.object({ id: z.string().min(1) });
const kvNameParams = kvParams.extend({ name: z.string().min(1).max(128) });

const notFound = () =>
  Response.json({ error: "Project not found" }, { status: 404 });

export function registerProjectKvRoutes(
  api: Pick<PluginServerApi, "registerHttpRoute">,
  repoOrFactory: RepoOrFactory,
  kvRepoFor: (auth: PluginAuthContext) => ProjectKvRepo
) {
  /** The KV repo, or null when the caller cannot see the project. */
  const kvFor = async (auth: PluginAuthContext | undefined, id: string) => {
    if (!auth) {
      throw new Error("Auth context required");
    }
    const project = await getRepo(repoOrFactory, auth).getById(id);
    return project ? kvRepoFor(auth) : null;
  };

  api.registerHttpRoute({
    method: "get",
    path: "/api/projects/:id/kv",
    operation: { ...projectsOp(true), operationId: "projects_kv_list" },
    summary: "List a project's key/value entries",
    tags: ["projects"],
    request: { params: kvParams },
    responses: {
      200: { description: "Entries", schema: projectKvListResponseSchema },
      404: { description: "Not found", schema: notFoundSchema },
    },
    handler: async (ctx) => {
      const { id } = ctx.params as z.infer<typeof kvParams>;
      const kv = await kvFor(ctx.auth, id);
      if (!kv) {
        return notFound();
      }
      return { settings: await kv.list(id) };
    },
  });

  api.registerHttpRoute({
    method: "get",
    path: "/api/projects/:id/kv/:name",
    operation: { ...projectsOp(true), operationId: "projects_kv_get" },
    summary: "Get a project key/value entry (value null when unset)",
    tags: ["projects"],
    request: { params: kvNameParams },
    responses: {
      200: { description: "Entry", schema: projectKvEntrySchema },
      404: { description: "Not found", schema: notFoundSchema },
    },
    handler: async (ctx) => {
      const { id, name } = ctx.params as z.infer<typeof kvNameParams>;
      const kv = await kvFor(ctx.auth, id);
      if (!kv) {
        return notFound();
      }
      return (await kv.get(id, name)) ?? { name, type: "string", value: null };
    },
  });

  api.registerHttpRoute({
    method: "patch",
    path: "/api/projects/:id/kv/:name",
    operation: { ...projectsOp(false), operationId: "projects_kv_set" },
    summary: "Set a project key/value entry",
    tags: ["projects"],
    request: { params: kvNameParams, body: projectKvSetRequestSchema },
    responses: {
      200: { description: "Saved entry", schema: projectKvEntrySchema },
      404: { description: "Not found", schema: notFoundSchema },
    },
    handler: async (ctx) => {
      const { id, name } = ctx.params as z.infer<typeof kvNameParams>;
      const body = ctx.body as z.infer<typeof projectKvSetRequestSchema>;
      const kv = await kvFor(ctx.auth, id);
      if (!kv) {
        return notFound();
      }
      return kv.set(id, { name, ...body });
    },
  });

  api.registerHttpRoute({
    method: "delete",
    path: "/api/projects/:id/kv/:name",
    operation: { ...projectsOp(false), operationId: "projects_kv_delete" },
    summary: "Delete a project key/value entry",
    tags: ["projects"],
    request: { params: kvNameParams },
    responses: {
      200: {
        description: "Deleted",
        schema: z.object({ success: z.boolean() }),
      },
      404: { description: "Not found", schema: notFoundSchema },
    },
    handler: async (ctx) => {
      const { id, name } = ctx.params as z.infer<typeof kvNameParams>;
      const kv = await kvFor(ctx.auth, id);
      if (!kv) {
        return notFound();
      }
      await kv.delete(id, name);
      return { success: true };
    },
  });
}
