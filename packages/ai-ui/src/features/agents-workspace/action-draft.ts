import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { AiActionRecord } from "../../lib/admin/ai-runtime-api";

export interface ActionDraft {
  action_key: string;
  agent_id: string;
  /** Tool ids from Agent Skills `allowed-tools` (space-delimited in ACTION.md). */
  allowed_tools: string[];
  context_type: string;
  default_thread_mode: "reuse" | "new" | "none";
  description: string;
  input_schema_json: Record<string, unknown>;
  instruction_keys: string[];
  module_id: string;
  name: string;
  prompt_markdown: string;
  skills: string[];
}

export interface ParsedActionSourceDocument {
  draft: ActionDraft;
}

export function createEmptyActionDraft(): ActionDraft {
  return {
    action_key: "",
    agent_id: "",
    context_type: "",
    default_thread_mode: "new",
    description: "",
    input_schema_json: { type: "object" },
    instruction_keys: [],
    module_id: "engenty-core",
    name: "",
    prompt_markdown: buildDefaultActionPrompt({
      action_key: "",
      description: "",
      name: "",
    }),
    skills: [],
    allowed_tools: [],
  };
}

function normalizeMarkdownText(value: string | null | undefined) {
  return (value ?? "").replace(/\r\n/g, "\n");
}

function cloneJsonObject(value: Record<string, unknown> | null | undefined) {
  return JSON.parse(
    JSON.stringify(
      value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        value !== null
        ? value
        : {}
    )
  ) as Record<string, unknown>;
}

function normalizeStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/\s+/u)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeSkillsFromFrontmatter(
  frontmatter: Record<string, unknown>
): string[] {
  const merged =
    frontmatter.skills ??
    frontmatter.skill_keys ??
    frontmatter["skill-keys"] ??
    frontmatter.skillKeys;
  const next = normalizeStringArray(merged);
  return [...new Set(next)];
}

function normalizeAllowedToolsFromFrontmatter(
  frontmatter: Record<string, unknown>
): string[] {
  const fromSpec =
    frontmatter["allowed-tools"] ??
    frontmatter.allowed_tools ??
    frontmatter.allowedTools;
  let next = normalizeStringArray(fromSpec);
  if (next.length === 0 && frontmatter.tool_filter) {
    const legacy = frontmatter.tool_filter as Record<string, unknown>;
    next = normalizeStringArray(legacy.include);
  }
  return [...new Set(next)];
}

function normalizeInputSchema(
  value: unknown,
  fallback: Record<string, unknown>
) {
  if (value === undefined || value === null) {
    return cloneJsonObject(fallback);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("input_schema_json must be a JSON object.");
  }
  return cloneJsonObject(value as Record<string, unknown>);
}

function parseFrontmatter(markdown: string) {
  const normalized = normalizeMarkdownText(markdown);
  if (!normalized.startsWith("---\n")) {
    return {
      body: normalized,
      frontmatter: {} as Record<string, unknown>,
    };
  }
  const closing = normalized.indexOf("\n---\n", 4);
  if (closing < 0) {
    throw new Error("Frontmatter is missing a closing --- line.");
  }
  const rawYaml = normalized.slice(4, closing);
  let parsed: unknown = {};
  if (rawYaml.trim()) {
    try {
      parsed = parseYaml(rawYaml);
    } catch (error) {
      throw new Error(
        error instanceof Error
          ? error.message
          : "Frontmatter could not be parsed."
      );
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Frontmatter must be a YAML object.");
  }
  return {
    body: normalized.slice(closing + 5).replace(/^\n+/, ""),
    frontmatter: parsed as Record<string, unknown>,
  };
}

function buildDefaultActionPrompt(input: {
  action_key: string;
  description: string;
  name: string;
}) {
  const heading =
    input.name.trim() || input.action_key.trim() || "Untitled action";
  const summary =
    input.description.trim() ||
    "Describe the exact bounded task this action should execute.";
  return [
    `# ${heading}`,
    "",
    "## Task",
    "",
    summary,
    "",
    "## Steps",
    "",
    "1. Read the action input carefully.",
    "2. Execute only the narrow task this action is responsible for.",
    "3. Summarize the outcome clearly for the user.",
    "",
    "## Rules",
    "",
    "- Keep the action tightly scoped.",
    "- Use only the tools and skills required for this task.",
    "- Do not claim persistence unless a write actually succeeded.",
  ].join("\n");
}

export function createActionDraft(action: AiActionRecord): ActionDraft {
  return {
    action_key: action.id,
    agent_id: action.agent_id,
    context_type: action.context_type ?? "",
    default_thread_mode: action.default_thread_mode,
    description: action.description ?? "",
    input_schema_json: cloneJsonObject(action.input_schema_json),
    instruction_keys: [...action.instruction_keys],
    module_id: action.module_id?.trim() || "engenty-core",
    name: action.name,
    prompt_markdown:
      normalizeMarkdownText(action.prompt) ||
      buildDefaultActionPrompt({
        action_key: action.id,
        description: action.description ?? "",
        name: action.name,
      }),
    skills: [...action.skills],
    allowed_tools: [...action.allowed_tools],
  };
}

export function validateActionDraft(draft: ActionDraft) {
  const actionKey = draft.action_key.trim();
  if (!/^[a-z0-9]+(?:[.-][a-z0-9-]+)*$/u.test(actionKey)) {
    return "Action key must use lowercase letters or digits, with optional dot or hyphen segments.";
  }
  if (!draft.name.trim()) {
    return "Action name is required.";
  }
  if (!draft.agent_id.trim()) {
    return "Agent id is required.";
  }
  if (
    draft.default_thread_mode !== "reuse" &&
    draft.default_thread_mode !== "new" &&
    draft.default_thread_mode !== "none"
  ) {
    return "Default thread mode must be reuse, new, or none.";
  }
  const duplicateInstructionKeys = draft.instruction_keys.filter(
    (entry, index, array) => array.indexOf(entry) !== index
  );
  if (duplicateInstructionKeys.length > 0) {
    return `Instruction keys must be unique: ${duplicateInstructionKeys.join(", ")}`;
  }
  const duplicateSkills = draft.skills.filter(
    (entry, index, array) => array.indexOf(entry) !== index
  );
  if (duplicateSkills.length > 0) {
    return `Skills must be unique: ${duplicateSkills.join(", ")}`;
  }
  return null;
}

export function buildActionSourceFromDraft(draft: ActionDraft) {
  const frontmatter: Record<string, unknown> = {
    id: draft.action_key.trim(),
    name: draft.name.trim(),
    agent_id: draft.agent_id.trim(),
    description: draft.description.trim(),
    default_thread_mode: draft.default_thread_mode,
    module_id: draft.module_id.trim() || "engenty-core",
  };
  if (draft.context_type.trim()) {
    frontmatter.context_type = draft.context_type.trim();
  }
  if (draft.instruction_keys.length > 0) {
    frontmatter.instruction_keys = [...draft.instruction_keys];
  }
  if (draft.skills.length > 0) {
    frontmatter.skills = [...new Set(draft.skills)].join(" ");
  }
  if (draft.allowed_tools.length > 0) {
    frontmatter["allowed-tools"] = [...new Set(draft.allowed_tools)].join(" ");
  }
  if (Object.keys(draft.input_schema_json).length > 0) {
    frontmatter.input_schema_json = cloneJsonObject(draft.input_schema_json);
  }
  const frontmatterText = stringifyYaml(frontmatter).trimEnd();
  const body = normalizeMarkdownText(draft.prompt_markdown).replace(
    /\s+$/u,
    ""
  );
  return `${["---", frontmatterText, "---", "", body].join("\n").trimEnd()}\n`;
}

export function parseActionSourceToDraft(
  markdown: string,
  fallback: ActionDraft
): ParsedActionSourceDocument {
  const { body, frontmatter } = parseFrontmatter(markdown);
  const nextDraft: ActionDraft = {
    action_key:
      typeof frontmatter.id === "string" && frontmatter.id.trim()
        ? frontmatter.id.trim()
        : fallback.action_key,
    agent_id:
      typeof frontmatter.agent_id === "string" && frontmatter.agent_id.trim()
        ? frontmatter.agent_id.trim()
        : fallback.agent_id,
    context_type:
      typeof frontmatter.context_type === "string"
        ? frontmatter.context_type
        : "",
    default_thread_mode:
      frontmatter.default_thread_mode === "reuse" ||
      frontmatter.default_thread_mode === "new" ||
      frontmatter.default_thread_mode === "none"
        ? frontmatter.default_thread_mode
        : fallback.default_thread_mode,
    description:
      typeof frontmatter.description === "string"
        ? frontmatter.description
        : "",
    input_schema_json: normalizeInputSchema(
      frontmatter.input_schema_json,
      fallback.input_schema_json
    ),
    instruction_keys: normalizeStringArray(frontmatter.instruction_keys),
    module_id: fallback.module_id,
    name:
      typeof frontmatter.name === "string" && frontmatter.name.trim()
        ? frontmatter.name.trim()
        : fallback.name,
    prompt_markdown: body.replace(/\s+$/u, ""),
    skills: normalizeSkillsFromFrontmatter(frontmatter),
    allowed_tools: normalizeAllowedToolsFromFrontmatter(frontmatter),
  };
  return { draft: nextDraft };
}
