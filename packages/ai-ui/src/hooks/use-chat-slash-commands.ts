// The composer's slash-command catalog: host built-ins + module UI
// contributions (`registerChatCommand`) + the server COMMAND.md catalog
// (`GET /ai/v1/chat-commands`, narrowed to the agent when one is named) +
// tenant skills (`GET /ai/skills`) as selectable `/skill-name` rows (Claude
// Code / Cursor style). Server rows are authoritative for prompt/workflow
// kinds; a UI contribution with the same token only decorates them (icon,
// localized labels). `ui`-kind commands exist client-side only and need a
// frontend-tool dispatcher — a lane without one (a specialist's desk) does not
// list them. Skills yield to command tokens on collision.

import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import { useUiContributions } from "@engenty/ui-plugin-sdk";
import { useMemo } from "react";
import {
  type ChatCommandCatalogEntry,
  getAppsAiChatCommands,
  resolveEngentyAiServiceBaseUrl,
} from "../ag-ui/apps-ai/apps-ai-api.js";
import type { ChatSlashCommand } from "../components/copilot/composer/copilot-slash-command.js";
import {
  type FileStorageSkillSummary,
  getFileStorageSkills,
} from "../lib/runtime/skills-api.js";

const CHAT_COMMANDS_QUERY_KEY = ["ai-ui", "chat-commands"] as const;
const CHAT_SKILLS_QUERY_KEY = ["ai-ui", "chat-skills"] as const;

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

function skillSlashRows(
  skills: readonly FileStorageSkillSummary[],
  seen: ReadonlySet<string>,
  only: ReadonlySet<string> | null
): ChatSlashCommand[] {
  // Custom shadows managed for the same name — keep one row per token.
  const byName = new Map<string, FileStorageSkillSummary>();
  for (const skill of skills) {
    if (only && !only.has(skill.name)) {
      continue;
    }
    const existing = byName.get(skill.name);
    if (!existing || (existing.tier === "managed" && skill.tier === "custom")) {
      byName.set(skill.name, skill);
    }
  }
  return [...byName.values()]
    .filter((skill) => !seen.has(skill.name))
    .toSorted((a, b) => a.name.localeCompare(b.name))
    .map((skill) => ({
      command: skill.name,
      description: skill.description,
      group: "Skills",
      kind: "skill" as const,
      label: skill.title?.trim() || skill.name,
      pluginId: "skills",
    }));
}

export function useChatSlashCommands(input: {
  /**
   * The agent this composer talks to. Narrows the server catalog to commands
   * the agent may run (`agent_ids`); omitted for the copilot, which sees all.
   */
  agentId?: string | null;
  /** Built-ins supplied by the host surface (e.g. /clear → start a new chat). */
  builtins?: ChatSlashCommand[];
  /** Dispatch for `ui`-kind module contributions declaring a `frontendTool`. */
  runFrontendTool?: (toolName: string, argsText: string) => void;
  /**
   * Skills to offer as `/skill-name` rows. Omitted lists every tenant skill;
   * a specialist passes the ones it carries.
   */
  skillIds?: readonly string[];
}): ChatSlashCommand[] {
  const { contributions } = useUiContributions();
  const { t, i18n } = useTranslation("ai-ui");
  const serviceBaseUrl = resolveEngentyAiServiceBaseUrl() ?? "";
  const agentId = input.agentId?.trim() || null;

  const catalogQuery = useQuery({
    enabled: Boolean(serviceBaseUrl),
    queryFn: ({ signal }) =>
      getAppsAiChatCommands(serviceBaseUrl, agentId, signal),
    queryKey: [...CHAT_COMMANDS_QUERY_KEY, agentId ?? "*"],
    staleTime: 5 * 60 * 1000,
  });

  const skillsQuery = useQuery({
    enabled: Boolean(serviceBaseUrl),
    queryFn: ({ signal }) => getFileStorageSkills(signal),
    queryKey: CHAT_SKILLS_QUERY_KEY,
    staleTime: 5 * 60 * 1000,
  });

  const skillIdsKey = input.skillIds ? input.skillIds.join(" ") : null;

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
    // registry — only where the host can dispatch them.
    const runFrontendTool = input.runFrontendTool;
    if (runFrontendTool) {
      for (const contributed of uiContributed) {
        if (contributed.kind !== "ui" || seen.has(contributed.command)) {
          continue;
        }
        seen.add(contributed.command);
        const frontendTool = contributed.frontendTool;
        commands.push({
          command: contributed.command,
          description:
            (contributed.descriptionKey &&
            i18n.exists(contributed.descriptionKey)
              ? t(contributed.descriptionKey)
              : undefined) ?? contributed.description,
          group: contributed.pluginId,
          kind: "ui",
          label:
            (contributed.labelKey && i18n.exists(contributed.labelKey)
              ? t(contributed.labelKey)
              : undefined) ?? contributed.label,
          pluginId: contributed.pluginId,
          ...(frontendTool
            ? {
                run: (argsText: string) =>
                  runFrontendTool(frontendTool, argsText),
              }
            : {}),
        });
      }
    }

    // Skills as `/skill-name` rows — yield to any command token already claimed.
    const only = skillIdsKey === null ? null : new Set(skillIdsKey.split(" "));
    commands.push(
      ...skillSlashRows(skillsQuery.data?.skills ?? [], seen, only)
    );

    return commands;
  }, [
    catalogQuery.data,
    contributions.chatCommands,
    i18n,
    input.builtins,
    input.runFrontendTool,
    skillIdsKey,
    skillsQuery.data?.skills,
    t,
  ]);
}
