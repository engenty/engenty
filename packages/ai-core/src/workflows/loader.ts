// Module workflow definitions: `ai/workflows/<id>.workflow.json`, each a
// VERBATIM Mastra DynamicWorkflowGraph (PLAN-mounted-engentys T4.2). No prose
// lane, no compile step — the file is the artifact the version table stores.
//
// Shape validation happens here (a malformed file fails module registration);
// full Mastra validation (`assertValidDynamicWorkflow` + the graph checks)
// runs where Mastra lives, at the apps/ai reconcile that writes tenant rows.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type {
  WorkflowDefinition,
  WorkflowGraphDefinition,
} from "../contracts.js";

const workflowFileSchema = z.object({
  description: z.string().optional(),
  graph: z.array(z.record(z.string(), z.unknown())).min(1),
  id: z.string().min(1),
  inputSchema: z.record(z.string(), z.unknown()),
  metadata: z.record(z.string(), z.unknown()).optional(),
  outputSchema: z.record(z.string(), z.unknown()),
  requestContextSchema: z.record(z.string(), z.unknown()).optional(),
  stateSchema: z.record(z.string(), z.unknown()).optional(),
});

function stringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return;
  }
  const items = value.filter(
    (entry): entry is string => typeof entry === "string" && entry.trim() !== ""
  );
  return items.length > 0 ? items : undefined;
}

/** Derive the convenience fields callers read off `metadata`. */
export function toWorkflowDefinition(
  definition: WorkflowGraphDefinition,
  moduleId: string
): WorkflowDefinition {
  const metadata = definition.metadata ?? {};
  const title =
    typeof metadata.title === "string" && metadata.title.trim()
      ? metadata.title.trim()
      : definition.id;
  const owner =
    typeof metadata.owner_agent_id === "string" &&
    metadata.owner_agent_id.trim()
      ? metadata.owner_agent_id.trim()
      : null;
  const contextType =
    typeof metadata.context_type === "string" && metadata.context_type.trim()
      ? metadata.context_type.trim()
      : undefined;
  const allowedTools = stringList(metadata.allowed_tools);
  const skills = stringList(metadata.skills);
  return {
    definition,
    id: definition.id,
    module_id: moduleId,
    name: title,
    owner_agent_id: owner,
    ...(definition.description ? { description: definition.description } : {}),
    ...(contextType ? { context_type: contextType } : {}),
    ...(allowedTools ? { allowed_tools: allowedTools } : {}),
    ...(skills ? { skills } : {}),
  };
}

export function loadModuleWorkflowsFromDirectory(params: {
  moduleId: string;
  workflowsDir: string;
}): WorkflowDefinition[] {
  if (!existsSync(params.workflowsDir)) {
    return [];
  }
  const files = readdirSync(params.workflowsDir)
    .filter((name) => name.endsWith(".workflow.json"))
    .sort();
  return files.map((name) => {
    const filePath = join(params.workflowsDir, name);
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(filePath, "utf8"));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      throw new Error(`Invalid workflow JSON in ${filePath}: ${message}`);
    }
    const parsed = workflowFileSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        `Invalid workflow definition in ${filePath}: ${parsed.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; ")}`
      );
    }
    return toWorkflowDefinition(
      parsed.data as WorkflowGraphDefinition,
      params.moduleId
    );
  });
}

/**
 * The single-step brief, when the definition is the one-agent shape the
 * codemod produced (a `mapping` node whose mapConfig pins `brief.value`).
 * Multi-step workflows have per-node briefs and return undefined.
 */
export function workflowBrief(
  definition: WorkflowGraphDefinition
): string | undefined {
  for (const entry of definition.graph) {
    if (entry.type !== "mapping" || typeof entry.mapConfig !== "string") {
      continue;
    }
    try {
      const config = JSON.parse(entry.mapConfig) as {
        brief?: { value?: unknown };
      };
      if (typeof config.brief?.value === "string") {
        return config.brief.value;
      }
    } catch {
      // Not the shape we know; keep looking.
    }
  }
  return;
}
