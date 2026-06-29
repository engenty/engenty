import { useTranslation } from "@engenty/i18n/ui";
import { AgentChatPanel } from "./agent-chat-panel.js";
import { ChatShellHeader } from "./shell-header.js";

export function ChatPanel() {
  const { t } = useTranslation("engenty-copilot");

  return (
    <AgentChatPanel
      compactContextControl={
        <div className="min-w-0 shrink-0 md:hidden">
          <ChatShellHeader />
        </div>
      }
      composerPlaceholder={t("chat.composerPlaceholder")}
      emptyStateSubtitle={t("chat.emptyStateSubtitle")}
      emptyStateTitle={t("chat.emptyStateTitle")}
      title={t("menu.label")}
    />
  );
}
