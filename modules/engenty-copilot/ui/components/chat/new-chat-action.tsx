import {
  ENGENTY_COPILOT_HOST_KEY,
  useCopilotThreadActions,
  useCopilotThreadBinding,
  useEngentyAIContext,
  useEngentyThreads,
} from "@engenty/ai-ui";
import { useTranslation } from "@engenty/i18n/ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@engenty/ui-core";
import { MessageSquarePlus, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { CopilotSandboxesMenuSection } from "./copilot-sandboxes-menu-section.js";

export function ChatTopbarActions() {
  const { t: tc } = useTranslation("common");
  const { t } = useTranslation("engenty-copilot");
  const binding = useCopilotThreadBinding();
  const { clearSessions, startNewChat, isClearingSessions, isDeletingSession } =
    useCopilotThreadActions();
  const { isTransportReady } = useEngentyAIContext();
  const threads = useEngentyThreads(ENGENTY_COPILOT_HOST_KEY, {
    activeThreadIdOverride: binding.activeThreadId,
  });
  const [clearAllOpen, setClearAllOpen] = useState(false);
  const [clearAllError, setClearAllError] = useState<string | null>(null);
  const hasSessions = threads.threads.length > 0;

  return (
    <div className="flex items-center gap-1.5">
      <AlertDialog
        onOpenChange={(open) => {
          setClearAllOpen(open);
          if (!open) {
            setClearAllError(null);
          }
        }}
        open={clearAllOpen}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={t("chat.topbarMenu")}
              disabled={!isTransportReady}
              size="icon"
              type="button"
              variant="ghost"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            <CopilotSandboxesMenuSection deletePending={isDeletingSession} />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              disabled={!hasSessions || isDeletingSession}
              onClick={() => setClearAllOpen(true)}
            >
              {t("chat.clearAllChats")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("chat.clearAllChatsTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("chat.clearAllChatsDescription")}
            </AlertDialogDescription>
            {clearAllError ? (
              <p className="text-destructive text-sm">{clearAllError}</p>
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isClearingSessions}>
              {t("chat.clearAllChatsCancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isClearingSessions}
              onClick={async (event) => {
                event.preventDefault();
                setClearAllError(null);
                try {
                  await clearSessions();
                  setClearAllOpen(false);
                  // Dialog focus trap can steal focus after clear; bump again so composer refocuses.
                  binding.bumpNewChatGeneration();
                } catch (error) {
                  setClearAllError(
                    error instanceof Error ? error.message : String(error)
                  );
                }
              }}
            >
              {t("chat.clearAllChatsConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Button
        aria-label={tc("copilot.newChat")}
        disabled={!isTransportReady}
        onClick={() => startNewChat()}
        size="sm"
        type="button"
        variant="default"
      >
        <MessageSquarePlus className="mr-1.5 size-4" />
        {tc("copilot.newChat")}
      </Button>
    </div>
  );
}
