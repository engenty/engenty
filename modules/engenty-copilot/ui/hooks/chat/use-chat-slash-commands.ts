// The composer's slash-command catalog: core built-ins + module UI
// contributions (`registerChatCommand`) + the server COMMAND.md catalog
// (`GET /ai/v1/chat-commands`). Server rows are authoritative for
// prompt/action kinds; a UI contribution with the same token only decorates
// them (icon, localized labels). `ui`-kind commands exist client-side only.

import {
  type ChatCommandCatalogEntry,
  type ChatSlashCommand,
  getAppsAiChatCommands,
  resolveEngentyAiServiceBaseUrl,
} from "@engenty/ai-ui";
import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import { useUiContributions } from "@engenty/ui-plugin-sdk";
import { useMemo } from "react";

const CHAT_COMMANDS_QUERY_KEY = ["engenty-copilot", "chat-commands"] as const;

function argsHint(
  args: ChatCommandCatalogEntry["args"] | undefined
): string | undefined {
  if (!args || args.length === 0) {
    return;
  }
  return args
    .map((arg) => (arg.required ? `<${arg.name}>` : `<${arg.name}?>`))
    .join(" ");
}

export function useChatSlashCommands(input: {
  /** Built-ins supplied by the host surface (e.g. /clear → start a new chat). */
  builtins?: ChatSlashCommand[];
  /** Dispatch for `ui`-kind module contributions declaring a `frontendTool`. */
  runFrontendTool?: (toolName: string, argsText: string) => void;
}): ChatSlashCommand[] {
  const { contributions } = useUiContributions();
  const { t, i18n } = useTranslation("engenty-copilot");
  const serviceBaseUrl = resolveEngentyAiServiceBaseUrl() ?? "";

  const catalogQuery = useQuery({
    enabled: Boolean(serviceBaseUrl),
    queryFn: () => getAppsAiChatCommands(serviceBaseUrl),
    queryKey: CHAT_COMMANDS_QUERY_KEY,
    staleTime: 5 * 60 * 1000,
  });

  return useMemo(() => {
    const uiContributed = contributions.chatCommands.filter(
      (c) => (c.surface ?? "chat") === "chat"
    );
    const decorations = new Map(uiContributed.map((c) => [c.command, c]));
    const commands: ChatSlashCommand[] = [...(input.builtins ?? [])];
    const seen = new Set(commands.map((c) => c.command));

    for (const entry of catalogQuery.data ?? []) {
      if (seen.has(entry.command)) {
        continue;
      }
      seen.add(entry.command);
      const decoration = decorations.get(entry.command);
      const labelKey = decoration?.labelKey ?? entry.label_key ?? undefined;
      const descriptionKey =
        decoration?.descriptionKey ?? entry.description_key ?? undefined;
      commands.push({
        argsHint: argsHint(entry.args),
        command: entry.command,
        description:
          (descriptionKey && i18n.exists(descriptionKey)
            ? t(descriptionKey)
            : undefined) ??
          decoration?.description ??
          entry.description ??
          undefined,
        // Server core commands share the built-ins' group heading.
        group: entry.module_id === "core" ? "Core" : entry.module_id,
        kind: entry.kind,
        label:
          (labelKey && i18n.exists(labelKey) ? t(labelKey) : undefined) ??
          decoration?.label ??
          entry.label ??
          undefined,
        pluginId: entry.module_id,
      });
    }

    // Pure-UI contributions (no server row) execute via the frontend-tool
    // registry — resolved by the composer host through `run`.
    for (const contributed of uiContributed) {
      if (contributed.kind !== "ui" || seen.has(contributed.command)) {
        continue;
      }
      seen.add(contributed.command);
      const frontendTool = contributed.frontendTool;
      const runFrontendTool = input.runFrontendTool;
      commands.push({
        command: contributed.command,
        description:
          (contributed.descriptionKey && i18n.exists(contributed.descriptionKey)
            ? t(contributed.descriptionKey)
            : undefined) ?? contributed.description,
        group: contributed.pluginId,
        kind: "ui",
        label:
          (contributed.labelKey && i18n.exists(contributed.labelKey)
            ? t(contributed.labelKey)
            : undefined) ?? contributed.label,
        pluginId: contributed.pluginId,
        ...(frontendTool && runFrontendTool
          ? {
              run: (argsText: string) =>
                runFrontendTool(frontendTool, argsText),
            }
          : {}),
      });
    }

    return commands;
  }, [
    catalogQuery.data,
    contributions.chatCommands,
    i18n,
    input.builtins,
    input.runFrontendTool,
    t,
  ]);
}
