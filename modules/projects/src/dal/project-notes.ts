/**
 * Project notes: an ordered list of rich-text pages per project
 * (`module_projects.project_notes`). New pages go to the end of the list.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { uuidv7 } from "uuidv7";
import type { ProjectNote } from "../schema/types.js";

export type ProjectNotesRepo = ReturnType<typeof createProjectNotesRepo>;

export interface ProjectNoteInput {
  content_json?: Record<string, unknown> | null;
  content_markdown?: string | null;
  title?: string;
}

export interface ProjectNoteUpdateInput extends ProjectNoteInput {
  order_index?: number;
}

const COLUMNS =
  "id,project_id,title,content_json,content_markdown,order_index,created_by,created_at,updated_at";

export function createProjectNotesRepo(
  supabase: SupabaseClient,
  tenantId: string,
  scopeId: string
) {
  const notes = () => supabase.schema("module_projects").from("project_notes");

  return {
    async list(projectId: string): Promise<ProjectNote[]> {
      const { data, error } = await notes()
        .select(COLUMNS)
        .eq("tenant_id", tenantId)
        .eq("project_id", projectId)
        .order("order_index", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) {
        throw new Error(`Failed to list project notes: ${error.message}`);
      }
      return (data ?? []) as ProjectNote[];
    },

    async create(
      projectId: string,
      input: ProjectNoteInput,
      createdBy: string | null
    ): Promise<ProjectNote> {
      const { data: last, error: lastError } = await notes()
        .select("order_index")
        .eq("tenant_id", tenantId)
        .eq("project_id", projectId)
        .order("order_index", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastError) {
        throw new Error(`Failed to create project note: ${lastError.message}`);
      }
      const now = new Date().toISOString();
      const { data, error } = await notes()
        .insert({
          id: uuidv7(),
          tenant_id: tenantId,
          scope_id: scopeId,
          project_id: projectId,
          title: input.title ?? "",
          content_json: input.content_json ?? null,
          content_markdown: input.content_markdown ?? null,
          order_index: last ? Number(last.order_index) + 1 : 0,
          created_by: createdBy,
          created_at: now,
          updated_at: now,
        })
        .select(COLUMNS)
        .single();
      if (error) {
        throw new Error(`Failed to create project note: ${error.message}`);
      }
      return data as ProjectNote;
    },

    async update(
      projectId: string,
      noteId: string,
      input: ProjectNoteUpdateInput
    ): Promise<ProjectNote | null> {
      const { data, error } = await notes()
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq("tenant_id", tenantId)
        .eq("project_id", projectId)
        .eq("id", noteId)
        .select(COLUMNS)
        .maybeSingle();
      if (error) {
        throw new Error(`Failed to update project note: ${error.message}`);
      }
      return (data as ProjectNote | null) ?? null;
    },

    async delete(projectId: string, noteId: string): Promise<boolean> {
      const { data, error } = await notes()
        .delete()
        .eq("tenant_id", tenantId)
        .eq("project_id", projectId)
        .eq("id", noteId)
        .select("id");
      if (error) {
        throw new Error(`Failed to delete project note: ${error.message}`);
      }
      return (data ?? []).length > 0;
    },
  };
}
