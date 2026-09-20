// Chat slash commands — client-side catalog shape + the leading-token parser.
// Commands are message-leading only: "/" must be the first character of the
// draft. The canonical command string is ASCII (localized labels participate in
// the typeahead filter only, never as the persisted token).

import { rankRecordsLexically } from "@engenty/search-index";

export type ChatSlashCommandKind = "prompt" | "workflow" | "skill" | "ui";

export interface ChatSlashCommand {
  /** Hint rendered after the command in the menu, e.g. "<contact>". */
  argsHint?: string;
  /** What the user types after "/" — canonical ASCII token, e.g. "create-offer". */
  command: string;
  description?: string;
  /** Menu group heading (module display name; built-ins group under "Core"). */
  group?: string;
  kind: ChatSlashCommandKind;
  label?: string;
  /** Source badge for module commands (plugin id). */
  pluginId?: string;
  /**
   * kind=ui only — executed client-side by the host; no message is sent.
   * Receives the free text typed after the command token.
   */
  run?: (argsText: string) => void;
  /**
   * kind=workflow only — `wizard` marks a run walked one step per page. The
   * composer presses it directly instead of sending a message.
   */
  surface?: "wizard";
  /** kind=workflow only — the stored workflow the command presses. */
  workflowId?: string;
}

/** Where a submitted draft goes once its leading `/token` is read. */
export type SlashSubmitRoute =
  | { argsText: string; command: ChatSlashCommand; kind: "ui" }
  | {
      argsText: string;
      command: ChatSlashCommand & { surface: "wizard"; workflowId: string };
      kind: "wizard";
    }
  | { kind: "message" };

/**
 * A `ui` command runs client-side; a wizard command is pressed client-side
 * when the host can press one; everything else is a message for the agent —
 * including a wizard command on a host that cannot press it, where the
 * agent then narrates the press as it always did.
 */
export function routeSlashSubmit(
  text: string,
  commands: readonly ChatSlashCommand[],
  options: { canPressWizard: boolean }
): SlashSubmitRoute {
  const match = parseLeadingSlashCommand(text, commands);
  if (!match) {
    return { kind: "message" };
  }
  if (match.command.kind === "ui") {
    return { argsText: match.argsText, command: match.command, kind: "ui" };
  }
  if (options.canPressWizard && isWizardSlashCommand(match.command)) {
    return {
      argsText: match.argsText,
      command: match.command,
      kind: "wizard",
    };
  }
  return { kind: "message" };
}

/** A wizard command is pressed by the client, never narrated by the agent. */
export function isWizardSlashCommand(
  command: Pick<ChatSlashCommand, "kind" | "surface" | "workflowId">
): command is ChatSlashCommand & { surface: "wizard"; workflowId: string } {
  return (
    command.kind === "workflow" &&
    command.surface === "wizard" &&
    typeof command.workflowId === "string" &&
    command.workflowId.length > 0
  );
}

const COMMAND_TOKEN_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/** True when `command` is a valid canonical slash token. */
export function isValidSlashCommandToken(command: string): boolean {
  return COMMAND_TOKEN_PATTERN.test(command);
}

/**
 * The in-progress slash query at the caret, or null when the composer is not
 * in slash-typeahead position. Only a message-leading "/" triggers: the "/"
 * must be the first character and the caret must still be inside the first
 * whitespace-delimited token.
 */
export function getSlashQueryAtCursor(
  text: string,
  cursor: number
): { query: string } | null {
  if (!text.startsWith("/")) {
    return null;
  }
  const safeCursor = Math.max(0, Math.min(cursor, text.length));
  if (safeCursor < 1) {
    return null;
  }
  const beforeCursor = text.slice(1, safeCursor);
  if (/\s/.test(beforeCursor)) {
    return null;
  }
  return { query: beforeCursor };
}

/**
 * Match a draft's leading "/token" against the known commands (exact token,
 * case-insensitive). Returns the matched command plus the free text after it.
 * Unknown tokens return null — the draft is then plain text.
 */
export function parseLeadingSlashCommand(
  text: string,
  commands: readonly ChatSlashCommand[]
): { argsText: string; command: ChatSlashCommand } | null {
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
 * Filter the catalog for the typeahead menu. Matches the canonical command
 * token plus the (possibly localized) label and description — label /
 * description matching is filter-only (never the persisted token).
 */
export function filterSlashCommands(
  commands: readonly ChatSlashCommand[],
  query: string
): ChatSlashCommand[] {
  const trimmed = query.trim();
  if (!trimmed) {
    return [...commands];
  }
  return rankRecordsLexically(commands, trimmed, (command) => ({
    description: command.description ?? "",
    id: command.command,
    name: command.label ?? command.command,
  }));
}

/** Menu rows grouped for display, preserving catalog order within groups. */
export function groupSlashCommands(
  commands: readonly ChatSlashCommand[]
): Array<{ commands: ChatSlashCommand[]; group: string }> {
  const groups = new Map<string, ChatSlashCommand[]>();
  for (const command of commands) {
    const group = command.group ?? "";
    const bucket = groups.get(group);
    if (bucket) {
      bucket.push(command);
    } else {
      groups.set(group, [command]);
    }
  }
  return [...groups.entries()].map(([group, grouped]) => ({
    commands: grouped,
    group,
  }));
}
