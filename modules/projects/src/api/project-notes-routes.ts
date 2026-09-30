/**
 * Project notes over HTTP: list, create, update and delete a project's pages.
 * A project the caller cannot see answers 404, so its notes are as visible as
 * the project.
 */
import type { PluginAuthContext, PluginServerApi } from "@engenty/plugin-sdk";
import { z } from "@hono/zod-openapi";
import type { ProjectNotesRepo } from "../dal/project-notes.js";
import {
  notFoundSchema,
  projectNoteCreateSchema,
  projectNoteSchema,
  projectNotesListResponseSchema,
  projectNoteUpdateSchema,
} from "../schema/zod.js";
import { getRepo, projectsOp, type RepoOrFactory } from "./gateway-shared.js";

const notesParams = z.object({ id: z.string().min(1) });
const noteParams = notesParams.extend({ noteId: z.string().min(1) });

const notFound = (what: "Project" | "Note") =>
  Response.json({ error: `${what} not found` }, { status: 404 });

export function registerProjectNotesRoutes(
  api: Pick<PluginServerApi, "registerHttpRoute">,
  repoOrFactory: RepoOrFactory,
  notesRepoFor: (auth: PluginAuthContext) => ProjectNotesRepo
) {
  /** The notes repo, or null when the caller cannot see the project. */
  const notesFor = async (auth: PluginAuthContext | undefined, id: string) => {
    if (!auth) {
      throw new Error("Auth context required");
    }
    const project = await getRepo(repoOrFactory, auth).getById(id);
    return project ? notesRepoFor(auth) : null;
  };

  api.registerHttpRoute({
    method: "get",
    path: "/api/projects/:id/notes",
    operation: { ...projectsOp(true), operationId: "projects_notes_list" },
    summary: "List a project's note pages in order",
    tags: ["projects"],
    request: { params: notesParams },
    responses: {
      200: {
        description: "Note pages",
        schema: projectNotesListResponseSchema,
      },
      404: { description: "Not found", schema: notFoundSchema },
    },
    handler: async (ctx) => {
      const { id } = ctx.params as z.infer<typeof notesParams>;
      const notes = await notesFor(ctx.auth, id);
      if (!notes) {
        return notFound("Project");
      }
      return { notes: await notes.list(id) };
    },
  });

  api.registerHttpRoute({
    method: "post",
    path: "/api/projects/:id/notes",
    operation: { ...projectsOp(false), operationId: "projects_notes_create" },
    summary: "Add a note page at the end of a project's notes",
    tags: ["projects"],
    request: { params: notesParams, body: projectNoteCreateSchema },
    responses: {
      200: { description: "Created page", schema: projectNoteSchema },
      404: { description: "Not found", schema: notFoundSchema },
    },
    handler: async (ctx) => {
      const { id } = ctx.params as z.infer<typeof notesParams>;
      const body = ctx.body as z.infer<typeof projectNoteCreateSchema>;
      const notes = await notesFor(ctx.auth, id);
      if (!notes) {
        return notFound("Project");
      }
      return notes.create(id, body, ctx.auth?.principalId ?? null);
    },
  });

  api.registerHttpRoute({
    method: "patch",
    path: "/api/projects/:id/notes/:noteId",
    operation: { ...projectsOp(false), operationId: "projects_notes_update" },
    summary: "Update a note page's title, content or position",
    tags: ["projects"],
    request: { params: noteParams, body: projectNoteUpdateSchema },
    responses: {
      200: { description: "Updated page", schema: projectNoteSchema },
      404: { description: "Not found", schema: notFoundSchema },
    },
    handler: async (ctx) => {
      const { id, noteId } = ctx.params as z.infer<typeof noteParams>;
      const body = ctx.body as z.infer<typeof projectNoteUpdateSchema>;
      const notes = await notesFor(ctx.auth, id);
      if (!notes) {
        return notFound("Project");
      }
      return (await notes.update(id, noteId, body)) ?? notFound("Note");
    },
  });

  api.registerHttpRoute({
    method: "delete",
    path: "/api/projects/:id/notes/:noteId",
    operation: { ...projectsOp(false), operationId: "projects_notes_delete" },
    summary: "Delete a note page",
    tags: ["projects"],
    request: { params: noteParams },
    responses: {
      200: {
        description: "Deleted",
        schema: z.object({ success: z.boolean() }),
      },
      404: { description: "Not found", schema: notFoundSchema },
    },
    handler: async (ctx) => {
      const { id, noteId } = ctx.params as z.infer<typeof noteParams>;
      const notes = await notesFor(ctx.auth, id);
      if (!notes) {
        return notFound("Project");
      }
      return (await notes.delete(id, noteId))
        ? { success: true }
        : notFound("Note");
    },
  });
}
