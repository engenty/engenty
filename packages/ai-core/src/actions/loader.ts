import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "@11ty/gray-matter";
import { type ZodType, z } from "zod";
import { normalizeAllowedToolsInput } from "../allowed-tools.js";
import type { ActionDefinition } from "../contracts.js";

const actionFileFrontmatterSchema = z
  .object({
    agent_id: z.string(),
    context_type: z.string().nullable().optional(),
    default_thread_mode: z.enum(["reuse", "new", "none"]),
    description: z.string().optional(),
    id: z.string(),
    /** Legacy: resolve `input_schema` from `schemaReferences` by key. */
    input_schema_ref: z.string().optional(),
    /**
     * JSON Schema object in YAML front matter (persisted as `input_schema_json` in the catalog).
     * Prefer this over `input_schema_ref` for module actions.
     */
    input_schema_json: z.record(z.string(), z.unknown()).optional(),
    instruction_keys: z.array(z.string()).optional().default([]),
    module_id: z.string().optional(),
    name: z.string(),
    skills: z.union([z.array(z.string()), z.string()]).optional(),
    allowed_tools: z.union([z.array(z.string()), z.string()]).optional(),
  })
  .superRefine((data, ctx) => {
    const ref = data.input_schema_ref?.trim();
    const jsonDefined = data.input_schema_json !== undefined;
    if (ref && jsonDefined) {
      ctx.addIssue({
        code: "custom",
        message: "Use either input_schema_ref or input_schema_json, not both.",
        path: ["input_schema_ref"],
      });
    }
    if (!(ref || jsonDefined)) {
      ctx.addIssue({
        code: "custom",
        message:
          "Set input_schema_json (JSON Schema in YAML) or input_schema_ref.",
        path: ["input_schema_json"],
      });
    }
  });

export type ActionFileFrontmatter = z.infer<typeof actionFileFrontmatterSchema>;

export interface ActionSchemaReferenceMap {
  [key: string]: ZodType;
}

function listActionMarkdownFiles(actionsDir: string): string[] {
  const entries = readdirSync(actionsDir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(actionsDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listActionMarkdownFiles(path));
      continue;
    }
    if (entry.isFile() && entry.name === "ACTION.md") {
      files.push(path);
    }
  }
  return files.sort();
}

function extractActionDescription(
  body: string,
  fallback: string | undefined
): string | undefined {
  if (fallback?.trim()) {
    return fallback.trim();
  }
  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    return line.replace(/^-+\s*/, "").trim();
  }
  return;
}

export function resolveModuleActionsDir(importMetaUrl: string): string {
  const here = dirname(fileURLToPath(importMetaUrl));
  const candidates = [
    join(here, "actions"),
    join(here, "..", "..", "ai", "actions"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(
    `Could not find ai/actions directory relative to ${importMetaUrl}`
  );
}

export function loadActionDefinitionsFromDirectory(params: {
  actionsDir: string;
  moduleId: string;
  /** Optional map for legacy `input_schema_ref` in ACTION.md front matter. */
  schemaReferences?: ActionSchemaReferenceMap;
}): ActionDefinition[] {
  const schemaReferences = params.schemaReferences ?? {};
  return listActionMarkdownFiles(params.actionsDir).map((filePath) => {
    const parsed = matter(readFileSync(filePath, "utf8"));
    const raw = { ...(parsed.data as Record<string, unknown>) };
    const toolsMerged =
      raw["allowed-tools"] ?? raw.allowed_tools ?? raw.allowedTools;
    raw["allowed-tools"] = undefined;
    raw.allowedTools = undefined;
    if (toolsMerged !== undefined) {
      raw.allowed_tools = toolsMerged;
    }
    const skillsMerged =
      raw.skills ?? raw.skill_keys ?? raw["skill-keys"] ?? raw.skillKeys;
    raw.skill_keys = undefined;
    raw["skill-keys"] = undefined;
    raw.skillKeys = undefined;
    if (skillsMerged !== undefined) {
      raw.skills = skillsMerged;
    }
    const legacyFilter = raw.tool_filter;
    raw.tool_filter = undefined;
    if (
      legacyFilter &&
      typeof legacyFilter === "object" &&
      !Array.isArray(legacyFilter) &&
      raw.allowed_tools === undefined
    ) {
      const include = (legacyFilter as { include?: unknown }).include;
      if (Array.isArray(include) && include.length > 0) {
        raw.allowed_tools = include;
      }
    }
    const frontmatter = actionFileFrontmatterSchema.parse(raw);
    const ref = frontmatter.input_schema_ref?.trim();
    const jsonSchema = frontmatter.input_schema_json;
    const jsonDefined = jsonSchema !== undefined;

    let inputSchema: ZodType;
    if (ref) {
      const resolved = schemaReferences[ref];
      if (!resolved) {
        throw new Error(`Unknown input_schema_ref "${ref}" in ${filePath}`);
      }
      inputSchema = resolved;
    } else if (jsonDefined) {
      try {
        inputSchema = z.fromJSONSchema(jsonSchema);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        throw new Error(`Invalid input_schema_json in ${filePath}: ${message}`);
      }
    } else {
      throw new Error(
        `Missing input schema in ${filePath} (expected input_schema_json or input_schema_ref)`
      );
    }
    const inputSchemaJson = jsonDefined
      ? (structuredClone(jsonSchema) as Record<string, unknown>)
      : undefined;
    const allowedTools = normalizeAllowedToolsInput(frontmatter.allowed_tools);
    const skills = normalizeAllowedToolsInput(frontmatter.skills) ?? [];
    return {
      agent_id: frontmatter.agent_id,
      context_type: frontmatter.context_type ?? undefined,
      default_thread_mode: frontmatter.default_thread_mode,
      description: extractActionDescription(
        parsed.content,
        frontmatter.description
      ),
      id: frontmatter.id,
      ...(inputSchemaJson === undefined
        ? {}
        : { input_schema_json: inputSchemaJson }),
      input_schema: inputSchema,
      instruction_keys: frontmatter.instruction_keys,
      module_id: frontmatter.module_id ?? params.moduleId,
      name: frontmatter.name,
      prompt: parsed.content.trim(),
      ...(skills.length > 0 ? { skills } : {}),
      ...(allowedTools ? { allowed_tools: allowedTools } : {}),
    } satisfies ActionDefinition;
  });
}
