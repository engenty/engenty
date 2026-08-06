import {
  ENGENTY_COPILOT_HOST_KEY,
  ThreadStatusIcon,
  useCopilotThreadBinding,
  useEngentyThread,
} from "@engenty/ai-ui";
import { useTranslation } from "@engenty/i18n/ui";

/**
 * Compact session chip for mobile chat chrome (status + title).
 * Desktop module sidebar uses `ModuleSidebarHeaderLabel` instead.
 */
export function ChatShellHeader() {
  const { t } = useTranslation("engenty-copilot");
  const binding = useCopilotThreadBinding();
  const thread = useEngentyThread(ENGENTY_COPILOT_HOST_KEY, {
    threadId: binding.activeThreadId,
  });

  const status = binding.activeThreadId
    ? (thread.session?.status ?? "idle")
    : "draft";
  const sessionLabel = binding.activeThreadId
    ? thread.session?.title?.trim() ||
      thread.session?.summary?.trim() ||
      t("chat.draftSession")
    : t("chat.draftSession");

  return (
    <div className="flex h-10 min-w-0 flex-1 items-center gap-2">
      <ThreadStatusIcon label={statusLabel(status, t)} status={status} />
      <span className="min-w-0 truncate text-[13px] text-foreground leading-snug">
        {sessionLabel}
      </span>
    </div>
  );
}

function statusLabel(status: string, t: (key: string) => string): string {
  if (status === "running") {
    return t("chat.statusRunning");
  }
  if (status === "draft") {
    return t("chat.statusDraft");
  }
  if (status === "waiting") {
    return t("chat.statusWaiting");
  }
  if (status === "failed") {
    return t("chat.statusFailed");
  }
  if (status === "completed") {
    return t("chat.statusCompleted");
  }
  return t("chat.statusIdle");
}
