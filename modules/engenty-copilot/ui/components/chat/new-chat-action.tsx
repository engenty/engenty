import {
  spaceChatsPathname,
  spaceKeyFromPathname,
} from "@engenty/ai-core/browser";
import {
  ENGENTY_COPILOT_HOST_KEY,
  ThreadContextMenuItem,
  ThreadContextToggle,
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@engenty/ui-core";
import { History, MessageSquarePlus, MoreVertical } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ThreadList } from "../thread-list/thread-list.js";
import { CopilotSandboxesMenuSection } from "./copilot-sandboxes-menu-section.js";

/**
 * This chat's own history, in a popover — the in-space replacement for the
 * sidebar list (PLAN-space-chats.md).
 *
 * Only inside a space. Outside one the sidebar still IS the list, and a second
 * copy of it behind a button is the duplication the space column was moved out
 * of the way to avoid. It renders the very same `ThreadList`, so search,
 * filters and grouping are the ones that were always there.
 */
function ChatHistoryAction() {
  const { t } = useTranslation("engenty-copilot");
  const location = useLocation();
  const spaceKey = spaceKeyFromPathname(location.pathname);
  if (spaceKey == null) {
    return null;
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label={t("chat.history", { defaultValue: "History" })}
          className="!size-7 !w-7 !min-w-7 !px-0"
          size="icon"
          type="button"
          variant="ghost"
        >
          <History className="size-4" />
        </Button>
      </PopoverTrigger>
      {/* Tall and scrolling: this is the whole list, not a "recent 5" — the
          sidebar's height is what it lost, so the popover has to give it back. */}
      <PopoverContent
        align="end"
        className="flex h-[min(32rem,70vh)] w-96 flex-col overflow-hidden p-0"
      >
        {/* `ThreadList` is `h-full shrink-0` — sized for a sidebar column that
            owns its height. In a fixed-height popover that makes it claim the
            whole card and push anything after it past the clipped edge, so it
            gets a flexible box of its own to shrink inside. */}
        <div className="min-h-0 flex-1 overflow-hidden">
          <ThreadList />
        </div>
        {/* This list is ONE agent's. The space's own page is every agent's,
            and this is the only door to it — the Work tab used to carry a
            Chats list and no longer does. */}
        <Link
          className="shrink-0 border-t px-3 py-2 text-muted-foreground text-xs hover:text-foreground"
          to={spaceChatsPathname(spaceKey)}
        >
          {t("chat.allSpaceChats", {
            defaultValue: "All chats in this space",
          })}
        </Link>
      </PopoverContent>
    </Popover>
  );
}

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
    <div className="flex items-center gap-0.5">
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
      <ChatHistoryAction />
      <ThreadContextToggle hostKey={ENGENTY_COPILOT_HOST_KEY} />
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
              className="!size-7 !w-7 !min-w-7 !px-0"
              disabled={!isTransportReady}
              size="icon"
              type="button"
              variant="ghost"
            >
              <MoreVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            <ThreadContextMenuItem />
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
    </div>
  );
}
