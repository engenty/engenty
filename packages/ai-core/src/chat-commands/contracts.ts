// Chat slash commands — serializable definitions modules declare via
// `ai/commands/<name>/COMMAND.md` (scanned by defineModuleAi). The server owns
// templates and expansion for `prompt`/`action` kinds; `ui` kinds execute
// client-side and are declared through the UI plugin SDK instead.

export type ChatCommandKind = "action" | "prompt";

export interface ChatCommandArg {
  label?: string;
  name: string;
  /** Enum options (type=enum). */
  options?: string[];
  /** Entity key for `ref` args, e.g. "contacts:contact" | "core:user" | "artifact". */
  ref_entity?: string;
  required?: boolean;
  type: "enum" | "ref" | "string";
}

export interface ChatCommandDefinition {
  /** kind=action — the module action or strict snake_case tool id to direct the agent at. */
  action_id?: string;
  /** Restrict the command to these agent ids (empty/absent = all agents). */
  agent_ids?: string[];
  args?: ChatCommandArg[];
  /** Canonical ASCII token typed after "/", unique per catalog. */
  command: string;
  description?: string;
  /** i18n key resolved client-side against the module's namespace. */
  description_key?: string;
  id: string;
  kind: ChatCommandKind;
  label?: string;
  label_key?: string;
  module_id: string;
  order?: number;
  /**
   * kind=prompt — the expansion template. `{input}` interpolates the free text
   * typed after the command; `{argName}` interpolates declared args when the
   * client sends structured values (v1: `{input}` only).
   */
  template?: string;
}

const COMMAND_TOKEN_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export function isValidChatCommandToken(command: string): boolean {
  return COMMAND_TOKEN_PATTERN.test(command);
}

/** Parse a message-leading "/token rest" against a catalog (exact token match). */
export function parseLeadingChatCommand(
  text: string,
  commands: readonly ChatCommandDefinition[]
): { argsText: string; command: ChatCommandDefinition } | null {
  const trimmed = text.trimStart();
  if (!trimmed.startsWith("/") || commands.length === 0) {
    return null;
  }
  const tokenEnd = trimmed.search(/\s/);
  const token = (
    tokenEnd < 0 ? trimmed.slice(1) : trimmed.slice(1, tokenEnd)
  ).toLowerCase();
  if (!token) {
    return null;
  }
  const command = commands.find((c) => c.command.toLowerCase() === token);
  if (!command) {
    return null;
  }
  const argsText = tokenEnd < 0 ? "" : trimmed.slice(tokenEnd + 1).trim();
  return { argsText, command };
}

/**
 * Expand a matched command into run-scoped instructions for the model. The
 * raw `/command` text stays the persisted user turn — this block rides the
 * AG-UI run context (system instructions), never the message history.
 */
export function expandChatCommand(input: {
  argsText: string;
  command: ChatCommandDefinition;
}): string {
  const { argsText, command } = input;
  if (command.kind === "action") {
    const target = command.action_id ?? command.command;
    return [
      `The user invoked the chat command "/${command.command}"${
        argsText ? ` with input: ${argsText}` : ""
      }.`,
      `Execute the ${command.module_id} action/tool "${target}" to fulfil it.`,
      "Use the referenced objects and the free text as the action's input. If required inputs are missing, ask for them first.",
    ].join(" ");
  }
  const template = command.template?.trim();
  if (!template) {
    return `The user invoked the chat command "/${command.command}"${
      argsText ? ` with input: ${argsText}` : ""
    }.`;
  }
  return template.replaceAll("{input}", argsText);
}
