// One-call module AI declaration (Phase 5). Scans the conventional ai/ tree
// and produces both registration payloads modules previously hand-assembled:
//
//   modules/<name>/ai/
//     agents/<agent-id>/agent.json   (+ AGENTS.md identity, optional SOUL.md)
//     skills/<skill-name>/SKILL.md
//     actions/<action-id>/ACTION.md
//     routines/<routine-id>/ROUTINE.md
//
// Node-only (fs) — exported from the main entry, never from browser.ts.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "@11ty/gray-matter";
import {
  type ActionSchemaReferenceMap,
  loadActionDefinitionsFromDirectory,
} from "./actions/loader.js";
import { loadAgentManifest } from "./agents/agent-manifest.js";
import { loadChatCommandDefinitionsFromDirectory } from "./chat-commands/loader.js";
import { DEFAULT_AI_CHAT_MODEL_ID } from "./config/chat-model-id.js";
import type {
  ActionDefinition,
  AgentDefinition,
  AiRegistration,
  InstructionDocumentDefinition,
  RoutineDefinition,
  SkillDefinition,
} from "./contracts.js";
import type { TriggerDefinition } from "./copilot-trigger-contracts.js";
import {
  type AgentConfig,
  agentConfigSchema,
  type DynamicAiModuleCapability,
  type MastraToolDefinition,
  toModuleActionCapability,
} from "./dynamic-contracts.js";
import type { AgentFnDescriptor } from "./hooks/types.js";
import { loadSkillDefinitionsFromDirectory } from "./skills/loader.js";

const AGENT_ID_PATTERN = /^[a-z0-9-]+\.[a-z0-9-]+$/;

/** Partial AgentConfig merged by id onto the scanned agent.json config. */
export interface AgentConfigOverride extends Partial<Omit<AgentConfig, "id">> {
  id: string;
}

export interface DefineModuleAiOptions {
  /** Code-level AgentDefinitions (dynamic prompts, chat routing) — passed through to AiRegistration.agents. */
  agentDefinitions?: () => AgentDefinition[];
  /**
   * Function agents (hook-composed bodies, conventionally authored in
   * agent.ts beside the agent directory). In-process channel like `tools`;
   * replaces a scanned agent.json config of the same id.
   */
  agentFns?: AgentFnDescriptor[];
  /** Merge/override scanned agent.json configs by id (model resolvers, workspace, instructions). */
  agents?: AgentConfigOverride[];
  /** Allow ACTION.md agent_id values outside this module's agents (cross-module refs). */
  allowCrossModuleActionAgents?: boolean;
  /** Module ai/ directory (pass `import.meta.url`; resolved like the skills loader). */
  dir: string;
  instructionDocuments?: InstructionDocumentDefinition[];
  moduleId: string;
  /** Legacy ACTION.md `input_schema_ref` resolution map. */
  schemaReferences?: ActionSchemaReferenceMap;
  /** Raw markdown map for the dynamic seed channel when using the `skills` hatch. */
  skillMarkdown?: () => Record<string, string>;
  /** Escape hatch replacing the SKILL.md directory scan (e.g. chatbot dynamic skills). */
  skills?: () => SkillDefinition[];
  /** Mastra tool builders by tool id — passed through to the dynamic capability. */
  tools?: Record<string, MastraToolDefinition>;
  triggers?: TriggerDefinition[];
}

export interface ModuleAi {
  aiRegistration(): AiRegistration;
  dynamicCapability(): DynamicAiModuleCapability;
}

function resolveAiDir(dirOrImportMetaUrl: string): string {
  // Accept either a plain directory path or an import.meta.url of the registrar.
  if (dirOrImportMetaUrl.startsWith("file://")) {
    return dirname(fileURLToPath(dirOrImportMetaUrl));
  }
  return dirOrImportMetaUrl;
}

function listAgentDirs(agentsDir: string): string[] {
  if (!existsSync(agentsDir)) {
    return [];
  }
  return readdirSync(agentsDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        existsSync(join(agentsDir, entry.name, "agent.json"))
    )
    .map((entry) => entry.name)
    .toSorted((a, b) => a.localeCompare(b));
}

function listRoutineMarkdownFiles(routinesDir: string): string[] {
  if (!existsSync(routinesDir)) {
    return [];
  }
  const entries = readdirSync(routinesDir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(routinesDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listRoutineMarkdownFiles(path));
      continue;
    }
    if (entry.isFile() && entry.name === "ROUTINE.md") {
      files.push(path);
    }
  }
  return files.sort();
}

function readInstructions(agentDir: string): string | null {
  const parts: string[] = [];
  for (const filename of ["AGENTS.md", "SOUL.md"]) {
    const filePath = join(agentDir, filename);
    if (existsSync(filePath)) {
      parts.push(readFileSync(filePath, "utf8").trim());
    }
  }
  return parts.length > 0 ? parts.join("\n\n") : null;
}

// Frontmatter metadata keys that count as an author-provided module tag (the
// apps/ai skill summary reads them in this order).
const MODULE_TAG_KEYS = ["modules", "engenty_modules", "module_id", "moduleId"];

function hasModuleTag(metadata: Record<string, unknown> | undefined): boolean {
  return (
    metadata !== undefined &&
    MODULE_TAG_KEYS.some((key) => metadata[key] !== undefined)
  );
}

// B4: auto-stamp the owning module into SKILL.md frontmatter (`metadata.modules`)
// when the author did not tag it. The stamped markdown is what the managed-skills
// seed persists to tenant file storage, so module-context filtering (skills.md C6)
// can rely on `engenty_modules` being present for every module skill.
function stampOwningModuleIntoSkillMarkdown(
  markdown: string,
  moduleId: string
): string {
  const parsed = matter(markdown);
  const data = { ...(parsed.data as Record<string, unknown>) };
  const metadata =
    data.metadata &&
    typeof data.metadata === "object" &&
    !Array.isArray(data.metadata)
      ? { ...(data.metadata as Record<string, unknown>) }
      : {};
  if (hasModuleTag(metadata)) {
    return markdown;
  }
  metadata.modules = [moduleId];
  data.metadata = metadata;
  return matter.stringify(parsed.content, data);
}

function readSkillMarkdownMap(skillsDir: string): Record<string, string> {
  const map: Record<string, string> = {};
  if (!existsSync(skillsDir)) {
    return map;
  }
  for (const entry of readdirSync(skillsDir, { withFileTypes: true }).toSorted(
    (a, b) => a.name.localeCompare(b.name)
  )) {
    if (!entry.isDirectory()) {
      continue;
    }
    const skillPath = join(skillsDir, entry.name, "SKILL.md");
    if (existsSync(skillPath)) {
      map[entry.name] = readFileSync(skillPath, "utf8");
    }
  }
  return map;
}

export function defineModuleAi(options: DefineModuleAiOptions): ModuleAi {
  const aiDir = resolveAiDir(options.dir);
  const agentsDir = join(aiDir, "agents");
  const skillsDir = join(aiDir, "skills");
  const actionsDir = join(aiDir, "actions");
  const commandsDir = join(aiDir, "commands");

  const overridesById = new Map<string, AgentConfigOverride>(
    (options.agents ?? []).map((override) => [override.id, override])
  );

  function buildAgentConfigs(): AgentConfig[] {
    const configs: AgentConfig[] = [];
    const seenIds = new Set<string>();
    const scannedIds = new Set(listAgentDirs(agentsDir));

    for (const agentId of scannedIds) {
      if (!AGENT_ID_PATTERN.test(agentId)) {
        throw new Error(
          `defineModuleAi(${options.moduleId}): agent id "${agentId}" must match <module>.<role> (lowercase, digits, dashes)`
        );
      }
      const agentDir = join(agentsDir, agentId);
      // Locator resolves join(dirname(importMetaUrl), segments..., agentId).
      const manifest = loadAgentManifest({
        agentId,
        candidateRootSegments: [["."]],
        importMetaUrl: `file://${join(agentsDir, "registrar-anchor.ts")}`,
      });
      if (seenIds.has(manifest.id)) {
        throw new Error(
          `defineModuleAi(${options.moduleId}): duplicate agent id "${manifest.id}"`
        );
      }
      seenIds.add(manifest.id);

      // Extra AgentConfig fields agent.json may carry (workspace etc.); the
      // manifest schema validates the core fields, raw passes the rest.
      const raw = JSON.parse(
        readFileSync(join(agentDir, "agent.json"), "utf8")
      ) as Record<string, unknown>;
      if (typeof raw.model === "string") {
        throw new Error(
          `defineModuleAi(${options.moduleId}): agent.json for "${manifest.id}" must not hardcode a model id — supply it via an AgentConfigOverride`
        );
      }
      const override = overridesById.get(manifest.id);
      const instructions =
        override?.instructions ?? readInstructions(agentDir) ?? undefined;
      if (!instructions) {
        throw new Error(
          `defineModuleAi(${options.moduleId}): agent "${manifest.id}" needs AGENTS.md next to agent.json or an instructions override`
        );
      }

      configs.push(
        agentConfigSchema.parse({
          description: manifest.description,
          id: manifest.id,
          instructions,
          model: DEFAULT_AI_CHAT_MODEL_ID,
          name: manifest.name,
          skillIds: manifest.skills,
          source: "module",
          toolIds: manifest.tools,
          ...(raw.workspace === undefined ? {} : { workspace: raw.workspace }),
          ...(raw.guardrails === undefined
            ? {}
            : { guardrails: raw.guardrails }),
          ...(raw.subAgents === undefined ? {} : { subAgents: raw.subAgents }),
          ...(raw.backgroundTasks === undefined
            ? {}
            : { backgroundTasks: raw.backgroundTasks }),
          ...override,
        })
      );
    }

    // Overrides for ids without a scanned directory must be full configs.
    for (const [id, override] of overridesById) {
      if (seenIds.has(id)) {
        continue;
      }
      configs.push(agentConfigSchema.parse({ source: "module", ...override }));
      seenIds.add(id);
    }
    return configs;
  }

  function buildSkillDefinitions(): SkillDefinition[] {
    if (options.skills) {
      // Escape-hatch definitions get the owning module stamped into metadata
      // unless the author already tagged one.
      return options.skills().map((skill) =>
        hasModuleTag(skill.metadata)
          ? skill
          : {
              ...skill,
              metadata: { ...skill.metadata, module_id: options.moduleId },
            }
      );
    }
    if (!existsSync(skillsDir)) {
      return [];
    }
    const ownerId = listAgentDirs(agentsDir)[0] ?? options.moduleId;
    return loadSkillDefinitionsFromDirectory({
      defaultMetadata: {
        owner_id: ownerId,
        owner_kind: "module",
        reference_kind: "module",
        source_reference: options.moduleId,
      },
      moduleId: options.moduleId,
      skillsDir,
    });
  }

  function buildActions(agentIds: Set<string>): ActionDefinition[] {
    if (!existsSync(actionsDir)) {
      return [];
    }
    const actions = loadActionDefinitionsFromDirectory({
      actionsDir,
      moduleId: options.moduleId,
      schemaReferences: options.schemaReferences,
    });
    if (!options.allowCrossModuleActionAgents) {
      for (const action of actions) {
        if (!agentIds.has(action.agent_id)) {
          throw new Error(
            `defineModuleAi(${options.moduleId}): action "${action.id}" references agent "${action.agent_id}" outside this module — set allowCrossModuleActionAgents to permit`
          );
        }
      }
    }
    return actions;
  }

  function buildRoutines(): RoutineDefinition[] {
    const routinesDir = join(aiDir, "routines");
    if (!existsSync(routinesDir)) {
      return [];
    }
    return listRoutineMarkdownFiles(routinesDir).map((filePath) => {
      const parsed = matter(readFileSync(filePath, "utf8"));
      const data = parsed.data as Record<string, any>;
      return {
        id: data.id,
        name: data.name,
        schedule: data.schedule,
        enabled_by_default: data.enabled_by_default ?? true,
        module_id: data.module_id ?? options.moduleId,
        quiet_hours: data.quiet_hours ?? null,
        suppress_if_no_op: data.suppress_if_no_op ?? false,
        target: data.target,
        description: parsed.content.trim() || undefined,
      } as unknown as RoutineDefinition;
    });
  }

  function buildChatCommands() {
    return loadChatCommandDefinitionsFromDirectory({
      commandsDir,
      moduleId: options.moduleId,
    });
  }

  function buildSkillMarkdown(): Record<string, string> {
    // Both the directory scan and the dynamic escape hatch flow through the
    // same module stamp so the seeded frontmatter always carries the owner.
    const raw = options.skillMarkdown
      ? options.skillMarkdown()
      : readSkillMarkdownMap(skillsDir);
    return Object.fromEntries(
      Object.entries(raw).map(([name, markdown]) => [
        name,
        stampOwningModuleIntoSkillMarkdown(markdown, options.moduleId),
      ])
    );
  }

  return {
    aiRegistration(): AiRegistration {
      const agentConfigs = buildAgentConfigs();
      const agentIds = new Set(agentConfigs.map((config) => config.id));
      const skillMarkdown = buildSkillMarkdown();
      const chatCommands = buildChatCommands();
      return {
        actions: buildActions(agentIds),
        agents: options.agentDefinitions?.() ?? [],
        ...(chatCommands.length > 0 ? { chat_commands: chatCommands } : {}),
        dynamic: {
          agent_configs: agentConfigs,
          ...(Object.keys(skillMarkdown).length > 0
            ? { skills: skillMarkdown }
            : {}),
        },
        instruction_documents: options.instructionDocuments,
        module_id: options.moduleId,
        routines: buildRoutines(),
        skills: buildSkillDefinitions(),
        triggers: options.triggers,
      };
    },

    dynamicCapability(): DynamicAiModuleCapability {
      const scannedConfigs = buildAgentConfigs();
      const agentFns = options.agentFns ?? [];
      // A function agent replaces a scanned agent.json config of the same id
      // (PLAN-agent-hooks D7): the json file may remain as documentation or
      // for the aiRegistration channel, but the function wins here.
      const fnIds = new Set(agentFns.map((descriptor) => descriptor.id));
      const agentConfigs = scannedConfigs.filter(
        (config) => !fnIds.has(config.id)
      );
      const skillMarkdown = buildSkillMarkdown();
      // Actions/routines travel in serializable form (JSON Schema, no zod) so
      // apps/ai can consume them over the core capability endpoint. Action
      // agent-id validation sees BOTH channels (json + function agents).
      const actions = buildActions(
        new Set([...scannedConfigs.map((config) => config.id), ...fnIds])
      ).map(toModuleActionCapability);
      const routines = buildRoutines();
      const chatCommands = buildChatCommands();
      return {
        agentConfigs,
        moduleId: options.moduleId,
        ...(actions.length > 0 ? { actions } : {}),
        ...(agentFns.length > 0 ? { agentFns } : {}),
        ...(chatCommands.length > 0 ? { chatCommands } : {}),
        ...(routines.length > 0 ? { routines } : {}),
        ...(Object.keys(skillMarkdown).length > 0
          ? { skills: skillMarkdown }
          : {}),
        ...(options.tools ? { tools: options.tools } : {}),
      };
    },
  };
}
