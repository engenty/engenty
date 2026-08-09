import type { PluginProfilePolicy } from "@engenty/plugin-sdk";

/**
 * Pull a project id out of an operation input. Per-project operations carry
 * either `project_id` (phase/task/comment ops) or `id` (projects_get / _update
 * / _delete via projectIdParamsSchema). List/create ops have neither and are
 * skipped (list visibility is enforced by the DAL filter, not this policy).
 */
function extractProjectId(input: unknown): string | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  const rec = input as Record<string, unknown>;
  if (typeof rec.project_id === "string") {
    return rec.project_id;
  }
  if (typeof rec.id === "string") {
    return rec.id;
  }
  return null;
}

// Minimal DB surface (a Supabase-like client). Kept loose so the module's
// service-role adapter satisfies it without importing supabase-js types here.
interface QueryResult {
  data: unknown;
  error: unknown;
}
interface EqStep {
  eq: (column: string, value: string) => EqStep;
  maybeSingle: () => Promise<QueryResult>;
}
interface VisibilityDb {
  schema: (name: string) => {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => EqStep;
      };
    };
  };
}

/**
 * Deny per-project operations on a members-only project to principals who are
 * not on its team. Tenant admins (`*`) and moderators
 * (`module.projects.moderate`) bypass. Returns null (abstain) for tenant-visible
 * projects and for operations with no project id.
 */
export function createProjectVisibilityPolicy(
  db: VisibilityDb
): PluginProfilePolicy {
  return async (input) => {
    if (input.moduleId !== "projects") {
      return null;
    }
    const projectId = extractProjectId(input.input);
    if (!projectId) {
      return null;
    }
    const caps = input.auth.capabilities;
    if (
      caps.includes("*") ||
      caps.includes("core.*") ||
      caps.includes("core.superadmin") ||
      caps.includes("module.projects.moderate")
    ) {
      return null;
    }

    const project = await db
      .schema("module_projects")
      .from("projects")
      .select("visibility")
      .eq("id", projectId)
      .maybeSingle();
    const visibility = (project.data as { visibility?: string } | null)
      ?.visibility;
    if (!visibility || visibility === "tenant") {
      return null;
    }

    // Service-role client: RLS is bypassed, so the tenant filter here is the
    // boundary. project_team carries tenant_id since the composite-FK
    // migration, so membership no longer has to be inferred via the project.
    const member = await db
      .schema("module_projects")
      .from("project_team")
      .select("user_id")
      .eq("tenant_id", input.auth.tenantId)
      .eq("project_id", projectId)
      .eq("user_id", input.auth.principalId)
      .maybeSingle();
    if ((member.data as unknown) != null) {
      return null;
    }
    return {
      action: "deny",
      reason: "project restricted to its members",
    };
  };
}
