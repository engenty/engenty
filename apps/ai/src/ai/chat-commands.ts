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

import { createWorkflowStoreFromEnv } from "./index.js";
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
  moduleLoader?: DynamicAiModuleCapabilityLoader,
  tenantId?: string
): Promise<ChatCommandDefinition[]> {
  const local = [...CORE_CHAT_COMMANDS, ...listRegisteredChatCommands()];
  const taken = new Set(local.map((command) => command.command));
  const commands = [...local];
  if (moduleLoader) {
    const capabilities = await moduleLoader.listModuleCapabilities();
    for (const command of capabilities.flatMap(
      (capability) => capability.chatCommands ?? []
    )) {
      if (!taken.has(command.command)) {
        taken.add(command.command);
        commands.push(command);
      }
    }
  }
  if (tenantId) {
    for (const command of await listWizardCommands(tenantId)) {
      if (!taken.has(command.command)) {
        taken.add(command.command);
        commands.push(command);
      }
    }
  }
  return commands;
}

/** A slash token from a workflow's title: "Angebot erstellen" → "angebot-erstellen". */
export function commandTokenFor(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/**
 * Every published wizard of the tenant is a command: `/<title>` opens it step
 * by step, no COMMAND.md needed. The stored row is the target — the client
 * presses it directly, without an agent turn — and its input schema's
 * properties are the args a person may type or @-mention.
 */
async function listWizardCommands(
  tenantId: string
): Promise<ChatCommandDefinition[]> {
  const store = createWorkflowStoreFromEnv();
  if (!store) {
    return [];
  }
  const rows = await store
    .list({ status: "active", surface: "wizard", tenantId })
    .catch(() => []);
  const commands: ChatCommandDefinition[] = [];
  for (const row of rows) {
    if (row.current_version === null) {
      continue;
    }
    const token = commandTokenFor(row.title ?? row.name);
    if (!token) {
      continue;
    }
    const current = await store
      .getCurrent({ id: row.id, tenantId })
      .catch(() => null);
    if (!current) {
      continue;
    }
    commands.push({
      args: commandArgsFromSchema(current.version.input_schema),
      command: token,
      ...(row.description ? { description: row.description } : {}),
      id: `workflow:${row.id}`,
      kind: "workflow",
      label: row.title ?? row.name,
      module_id: row.module_id ?? "workflows",
      surface: "wizard",
      workflow_id: row.id,
    });
  }
  return commands;
}

/** The typed/mentioned args a wizard's input schema admits. */
function commandArgsFromSchema(
  schema: Record<string, unknown> | null | undefined
): ChatCommandDefinition["args"] {
  const properties = (schema?.properties ?? {}) as Record<
    string,
    Record<string, unknown> | undefined
  >;
  const required = new Set(
    Array.isArray(schema?.required) ? (schema.required as string[]) : []
  );
  return Object.entries(properties).map(([name, property]) => {
    const ref =
      typeof property?.["x-ref"] === "string" ? property["x-ref"] : null;
    return {
      name,
      ...(typeof property?.title === "string" ? { label: property.title } : {}),
      ...(required.has(name) ? { required: true } : {}),
      ...(ref
        ? { ref_entity: ref, type: "ref" as const }
        : Array.isArray(property?.enum)
          ? {
              options: (property.enum as unknown[]).map(String),
              type: "enum" as const,
            }
          : { type: "string" as const }),
    };
  });
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
  /** Canonical ObjectRef: "<module>:<entity>:<id>" | "core:user:<id>" | "ai:agent:<id>" | "artifact:<id>". */
  ref: string;
}

/** Entity prefix of an @-mentioned agent (`ai:agent:<agent id>`). */
export const AGENT_REFERENCE_ENTITY = "ai:agent";
/** Entity prefix of an @-mentioned room (`ai:room:<thread id>`). */
export const ROOM_REFERENCE_ENTITY = "ai:room";
/** Entity prefix of an @-mentioned artifact (`artifact:<artifact id>`). */
export const ARTIFACT_REFERENCE_ENTITY = "artifact";

export interface ChatActionInvocationResult {
  /** An in-flight run for the same subject answered instead of a new one. */
  deduped: boolean;
  runId: string;
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
  invokeWorkflowCommand?: (input: {
    argsText: string;
    command: ChatCommandDefinition;
    refs: readonly ChatTurnReferenceItem[];
  }) => Promise<ChatActionInvocationResult>;
  moduleLoader?: DynamicAiModuleCapabilityLoader;
  prompt: string;
  refs: readonly ChatTurnReferenceItem[];
  /** Optional skill catalog — enables `/skill-name` expansion when no command matches. */
  skillStorage?: SkillStorage | null;
  /** Lists the tenant's published wizards as commands when given. */
  tenantId?: string;
}): Promise<Array<{ description: string; value: string }>> {
  const entries: Array<{ description: string; value: string }> = [];

  if (params.prompt.trimStart().startsWith("/")) {
    let attemptedActionCommand: ChatCommandDefinition | null = null;
    try {
      const all = await listAllChatCommands(
        params.moduleLoader,
        params.tenantId
      );
      const match = parseLeadingChatCommand(
        params.prompt,
        filterChatCommandsForAgent(all, params.agentId)
      );
      if (match) {
        if (match.command.kind === "workflow") {
          attemptedActionCommand = match.command;
          if (params.invokeWorkflowCommand) {
            const invoked = await params.invokeWorkflowCommand({
              ...match,
              refs: params.refs,
            });
            entries.push({
              description: "chat_command_workflow",
              value: [
                `The user invoked "/${match.command.command}".`,
                invoked.deduped
                  ? `A run for this subject was already in flight — run ${invoked.runId} answers instead of a duplicate.`
                  : `It dispatched as run ${invoked.runId}, bound to the referenced subject.`,
                "Do not call the Action or its underlying tools directly. Tell the user the run is underway and will report when it settles.",
              ].join(" "),
            });
          } else {
            entries.push({
              description: "chat_command_workflow",
              value:
                `The user invoked "/${match.command.command}", but this runnable Action could not be dispatched. ` +
                "Do not execute it directly. Explain that the durable invocation path is unavailable.",
            });
          }
        } else {
          entries.push({
            description: "chat_command",
            value: expandChatCommand(match),
          });
        }
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
      if (attemptedActionCommand) {
        entries.push({
          description: "chat_command_workflow",
          value:
            `The runnable Action "/${attemptedActionCommand.command}" could not be materialized as a Task. ` +
            "Do not execute it directly or substitute catalog writes. Report the durable invocation failure.",
        });
      }
    }
  }

  // Each kind of reference is a different instruction: a colleague to involve,
  // a room to talk in, a deliverable to open, a record to load. One
  // undifferentiated "here are some refs" made the model guess, and it guessed
  // `show_objects` for an App.
  const agentRefs = params.refs.filter((ref) =>
    ref.ref.startsWith(`${AGENT_REFERENCE_ENTITY}:`)
  );
  const roomRefs = params.refs.filter((ref) =>
    ref.ref.startsWith(`${ROOM_REFERENCE_ENTITY}:`)
  );
  const artifactRefs = params.refs.filter((ref) =>
    ref.ref.startsWith(`${ARTIFACT_REFERENCE_ENTITY}:`)
  );
  const objectRefs = params.refs.filter(
    (ref) =>
      !(
        agentRefs.includes(ref) ||
        roomRefs.includes(ref) ||
        artifactRefs.includes(ref)
      )
  );

  if (agentRefs.length > 0) {
    const lines = agentRefs.map(
      (ref) =>
        `- "${ref.label}" → agent id \`${ref.ref.slice(AGENT_REFERENCE_ENTITY.length + 1)}\``
    );
    entries.push({
      description: "user_mentioned_agents",
      value: [
        "The user @-mentioned these agents of this Space in their message:",
        ...lines,
        "When the message asks or hands something to one of them, use message_agent with that agent id — mode `ask` when you need their answer, `notify` to hand off and keep going. Say what the tool returned; never claim to have reached an agent unless the call succeeded.",
      ].join("\n"),
    });
  }

  if (roomRefs.length > 0) {
    const lines = roomRefs.map(
      (ref) =>
        `- "${ref.label}" → room_id \`${ref.ref.slice(ROOM_REFERENCE_ENTITY.length + 1)}\``
    );
    entries.push({
      description: "user_mentioned_rooms",
      value: [
        "The user @-mentioned these rooms of this Space in their message:",
        ...lines,
        "To speak in one, call message_agent with that `room_id` — never `agent_ids`, which would open a second room beside the one they named. Everyone in the room takes a turn unless you name members in `agent_ids` as well.",
        "You cannot READ a room's messages from here. Answer about what was said in one from what you already know, or ask in the room; never claim to have read it.",
      ].join("\n"),
    });
  }

  if (artifactRefs.length > 0) {
    const lines = artifactRefs.map(
      (ref) =>
        `- "${ref.label}" → artifact_id \`${ref.ref.slice(ARTIFACT_REFERENCE_ENTITY.length + 1)}\``
    );
    entries.push({
      description: "user_mentioned_artifacts",
      value: [
        "The user @-mentioned these artifacts in their message:",
        ...lines,
        "Open one with artifact_read before answering about its content — never describe an artifact you have not read. show_artifact puts it in front of them; artifact_write edits it.",
      ].join("\n"),
    });
  }

  if (objectRefs.length > 0) {
    const lines = objectRefs.map((ref) => `- "${ref.label}" → ${ref.ref}`);
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
