// Assembles the effective chat slash-command catalog for the current request:
// in-process registrations (apps/ai-local) plus module COMMAND.md definitions
// delivered over the core module-capability channel — mirroring module-actions.
// User-selected skills (`/skill-name`) expand here too when no command claims
// the token (Claude Code / Cursor style slash skill selection).
import {
  type ChatCommandDefinition,
  type DynamicAiModuleCapabilityLoader,
  expandChatCommand,
  listRegisteredChatCommands,
  parseLeadingChatCommand,
} from "@engenty/ai-core";

import type { SkillStorage } from "./skills/skill-storage.js";

// Core built-ins (prompt kind — `ui` built-ins live client-side). Core wins
// token collisions against module commands.
const CORE_CHAT_COMMANDS: ChatCommandDefinition[] = [
  {
    command: "summarize",
    description: "Summarize this conversation so far",
    id: "core.summarize",
    kind: "prompt",
    module_id: "core",
    template:
      "The user invoked /summarize. Produce a concise summary of this conversation so far: key facts, decisions, and open follow-ups, as a short bullet list. {input}",
  },
];

export async function listAllChatCommands(
  moduleLoader?: DynamicAiModuleCapabilityLoader
): Promise<ChatCommandDefinition[]> {
  const local = [...CORE_CHAT_COMMANDS, ...listRegisteredChatCommands()];
  if (!moduleLoader) {
    return local;
  }
  const localTokens = new Set(local.map((command) => command.command));
  const capabilities = await moduleLoader.listModuleCapabilities();
  const moduleCommands = capabilities
    .flatMap((capability) => capability.chatCommands ?? [])
    .filter((command) => !localTokens.has(command.command));
  return [...local, ...moduleCommands];
}

/** Catalog filtered for one agent (commands scoped via agent_ids hide elsewhere). */
export function filterChatCommandsForAgent(
  commands: readonly ChatCommandDefinition[],
  agentId: string | null | undefined
): ChatCommandDefinition[] {
  return commands.filter((command) => {
    if (!command.agent_ids || command.agent_ids.length === 0) {
      return true;
    }
    return Boolean(agentId && command.agent_ids.includes(agentId));
  });
}

export interface ChatTurnReferenceItem {
  entity?: string;
  label: string;
  /** Canonical ObjectRef: "<module>:<entity>:<id>" | "core:user:<id>" | "artifact:<id>". */
  ref: string;
}

/** Leading `/token rest` parse without a catalog — used for skill lookup. */
export function parseLeadingSlashToken(
  text: string
): { argsText: string; token: string } | null {
  const trimmed = text.trimStart();
  if (!trimmed.startsWith("/")) {
    return null;
  }
  const tokenEnd = trimmed.search(/\s/);
  const token = (
    tokenEnd < 0 ? trimmed.slice(1) : trimmed.slice(1, tokenEnd)
  ).toLowerCase();
  if (!token) {
    return null;
  }
  const argsText = tokenEnd < 0 ? "" : trimmed.slice(tokenEnd + 1).trim();
  return { argsText, token };
}

/**
 * Expand a user-selected skill into run-scoped instructions. Prefer injecting
 * the skill body (Claude Code / Cursor style) so the model does not need a
 * tool round-trip; fall back to a load directive when the body is unavailable.
 */
export function expandChatSkillSelection(input: {
  argsText: string;
  body?: string;
  description?: string;
  name: string;
}): string {
  const { argsText, body, description, name } = input;
  const header = [
    `The user selected skill "/${name}" via slash command.`,
    description ? `Skill summary: ${description}` : null,
    argsText
      ? `User input after the skill token:\n${argsText}`
      : "No additional user input after the skill token — follow the skill's default workflow and ask if you need more.",
  ]
    .filter(Boolean)
    .join("\n");

  const trimmedBody = body?.trim();
  if (trimmedBody) {
    return [
      header,
      "",
      "Follow these skill instructions for this turn (the body is already provided — do not call the skill tool to reload it):",
      "",
      `# Skill: ${name}`,
      "",
      trimmedBody,
    ].join("\n");
  }

  return [
    header,
    `Load skill "${name}" immediately with the skill tool, then follow its instructions to fulfil the request.`,
  ].join("\n");
}

/**
 * Run-scoped AG-UI context entries for the current user turn: the expansion of
 * a leading slash command or skill selection and/or the typed @-mention
 * references. Rides `RunAgentInput.context` (rendered into system instructions)
 * so the raw `/command` text stays the persisted user turn and history is
 * never rewritten.
 */
export async function buildChatTurnContextEntries(params: {
  agentId: string | null | undefined;
  moduleLoader?: DynamicAiModuleCapabilityLoader;
  prompt: string;
  refs: readonly ChatTurnReferenceItem[];
  /** Optional skill catalog — enables `/skill-name` expansion when no command matches. */
  skillStorage?: SkillStorage | null;
}): Promise<Array<{ description: string; value: string }>> {
  const entries: Array<{ description: string; value: string }> = [];

  if (params.prompt.trimStart().startsWith("/")) {
    try {
      const all = await listAllChatCommands(params.moduleLoader);
      const match = parseLeadingChatCommand(
        params.prompt,
        filterChatCommandsForAgent(all, params.agentId)
      );
      if (match) {
        entries.push({
          description: "chat_command",
          value: expandChatCommand(match),
        });
      } else if (params.skillStorage) {
        const leading = parseLeadingSlashToken(params.prompt);
        if (leading) {
          const skill = await params.skillStorage.getSkill(leading.token);
          if (skill) {
            entries.push({
              description: "chat_skill",
              value: expandChatSkillSelection({
                argsText: leading.argsText,
                body: skill.body,
                description: skill.description,
                name: skill.name,
              }),
            });
          }
        }
      }
    } catch (error) {
      // Catalog resolution is best-effort — an unmatched command is plain text.
      console.error("chat command expansion failed", error);
    }
  }

  if (params.refs.length > 0) {
    const lines = params.refs.map((ref) => `- "${ref.label}" → ${ref.ref}`);
    entries.push({
      description: "user_references",
      value: [
        "The user attached these object references to their message:",
        ...lines,
        "Load a reference with the owning module's tools (or show_objects) when it is relevant. If one cannot be resolved or you lack access, say so explicitly instead of guessing.",
      ].join("\n"),
    });
  }

  return entries;
}
