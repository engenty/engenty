"use client";

import { useTranslation } from "@engenty/i18n/ui";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@engenty/ui-core";
import { Braces, FileText, Hash } from "lucide-react";
import { useOptionalAgentHostByKey } from "../../../agent-provider/engenty-agent.js";
import { ENGENTY_COPILOT_HOST_KEY } from "../../../agent-provider/index.js";
import { useDeveloperModeEnabled } from "../../ag-ui-inspector/ag-ui-inspector-hooks.js";
import { formatCopilotThreadMarkdown } from "../transcript/copilot-thread-copy.js";

function copy(text: string) {
  void navigator.clipboard.writeText(text);
}

/**
 * Developer-mode tools in the copilot's ⋮ menu (window and sidebar share it):
 * the river as JSON (the host's messages, parts and all) or Markdown, and its
 * thread id. Null outside developer mode.
 */
export function CopilotDeveloperMenuSection() {
  const { t } = useTranslation("ai-ui");
  const developerMode = useDeveloperModeEnabled();
  const host = useOptionalAgentHostByKey(ENGENTY_COPILOT_HOST_KEY);
  if (!(developerMode && host)) {
    return null;
  }
  const { messages, threadId } = host;
  const hasMessages = messages.length > 0;
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuLabel className="text-[11px] uppercase tracking-wide">
        {t("agentDesk.copilot.developer.heading")}
      </DropdownMenuLabel>
      <DropdownMenuItem
        className="flex items-center gap-2"
        disabled={!hasMessages}
        onSelect={() => copy(JSON.stringify(messages, null, 2))}
      >
        <Braces aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <span>{t("agentDesk.copilot.developer.copyJson")}</span>
      </DropdownMenuItem>
      <DropdownMenuItem
        className="flex items-center gap-2"
        disabled={!hasMessages}
        onSelect={() => copy(formatCopilotThreadMarkdown(messages))}
      >
        <FileText
          aria-hidden
          className="size-4 shrink-0 text-muted-foreground"
        />
        <span>{t("agentDesk.copilot.developer.copyMarkdown")}</span>
      </DropdownMenuItem>
      <DropdownMenuItem
        className="flex items-center gap-2"
        disabled={!threadId}
        onSelect={() => threadId && copy(threadId)}
      >
        <Hash aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <span>{t("agentDesk.copilot.developer.copyId")}</span>
      </DropdownMenuItem>
    </>
  );
}
