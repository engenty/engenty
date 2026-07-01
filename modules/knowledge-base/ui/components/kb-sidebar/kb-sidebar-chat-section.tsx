/**
 * Compact chat sessions list in the module secondary column.
 */

import { useEngentyThreads } from "@engenty/ai-ui/embed";
import { shellSecondaryNavItemProps } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarRow,
  SidebarRowActions,
  SidebarRowButton,
  SidebarRowLeadingIcon,
  sidebarDenseMenuContentClassName,
  sidebarDenseMenuItemClassName,
  sidebarSectionLabelPlAlignToRootRowIconClassName,
} from "@engenty/ui-core";
import {
  Edit2,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Trash2,
} from "lucide-react";
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { formatKbRelativeTime } from "../../article-datetime.js";
import { isKbHubChatRoute, kbHubChatPath } from "../../kb-paths.js";

export function KbSidebarChatSection({ kbSlug }: { kbSlug: string }) {
  const { t, i18n } = useTranslation("kb");
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const activeThreadIdFromUrl = searchParams.get("thread_id")?.trim() || null;

  const { threads, isLoading, renameThread, deleteThread } = useEngentyThreads(
    "kb:search",
    {
      agentId: "knowledge-base.answers",
    }
  );

  const handleRename = async (
    e: React.MouseEvent,
    threadId: string,
    currentTitle: string
  ) => {
    e.preventDefault();
    e.stopPropagation();
    // biome-ignore lint/suspicious/noAlert: Simple prompt is acceptable for session renaming
    const nextTitle = window.prompt(
      t("chat.rename_session_prompt", "Enter new name:"),
      currentTitle
    );
    if (nextTitle !== null && nextTitle.trim().length > 0) {
      try {
        await renameThread(threadId, nextTitle.trim());
      } catch (err) {
        // biome-ignore lint/suspicious/noConsole: Simple error logging for debugging
        console.error("Failed to rename thread", err);
      }
    }
  };

  const handleDelete = async (e: React.MouseEvent, threadId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (
      // biome-ignore lint/suspicious/noAlert: Simple confirm is acceptable for session deletion
      window.confirm(
        t(
          "chat.delete_session_confirm",
          "Are you sure you want to delete this chat session?"
        )
      )
    ) {
      try {
        await deleteThread(threadId);
        if (activeThreadIdFromUrl === threadId) {
          navigate(kbHubChatPath(kbSlug));
        }
      } catch (err) {
        // biome-ignore lint/suspicious/noConsole: Simple error logging for debugging
        console.error("Failed to delete thread", err);
      }
    }
  };

  const isNewChatActive = isKbHubChatRoute(pathname) && !activeThreadIdFromUrl;
  const newChatTo = kbHubChatPath(kbSlug);

  return (
    <SidebarGroup className="shrink-0 p-0 pb-1">
      <SidebarGroupContent>
        <SidebarMenu className="gap-0.5">
          {/* New Chat Button */}
          <SidebarRow isActive={isNewChatActive}>
            <SidebarRowLeadingIcon icon={<Plus aria-hidden />} />
            <SidebarRowButton asChild isActive={isNewChatActive} size="sm">
              <Link to={newChatTo} {...shellSecondaryNavItemProps}>
                <span className="truncate">
                  {t("chat.new_session", "New Chat")}
                </span>
              </Link>
            </SidebarRowButton>
          </SidebarRow>

          {isLoading ? (
            <p
              className={cn(
                "py-1.5 text-muted-foreground text-xs",
                sidebarSectionLabelPlAlignToRootRowIconClassName
              )}
            >
              {t("sidebar.list_loading", "Loading…")}
            </p>
          ) : threads.length === 0 ? (
            <p
              className={cn(
                "py-1.5 text-muted-foreground text-xs italic",
                sidebarSectionLabelPlAlignToRootRowIconClassName
              )}
            >
              {t("chat.no_sessions", "No past chats")}
            </p>
          ) : (
            threads.map((thread) => {
              const to = `${kbHubChatPath(kbSlug)}?thread_id=${thread.id}`;
              const isActive = thread.id === activeThreadIdFromUrl;
              const title =
                thread.title?.trim() ||
                thread.summary?.trim() ||
                t("chat.untitled", "Chat");

              let relativeTime = "";
              if (thread.updated_at) {
                try {
                  relativeTime = formatKbRelativeTime(
                    thread.updated_at,
                    i18n.language
                  );
                } catch {
                  relativeTime = "";
                }
              }

              return (
                <SidebarRow isActive={isActive} key={thread.id}>
                  <SidebarRowLeadingIcon icon={<MessageSquare aria-hidden />} />
                  <SidebarRowButton asChild isActive={isActive} size="sm">
                    <Link to={to} {...shellSecondaryNavItemProps}>
                      <div className="flex min-w-0 flex-1 flex-col py-0.5">
                        <span className="truncate font-medium">{title}</span>
                        {relativeTime ? (
                          <span className="mt-0.5 truncate font-normal text-muted-foreground text-xxs leading-none">
                            {relativeTime}
                          </span>
                        ) : null}
                      </div>
                    </Link>
                  </SidebarRowButton>
                  <SidebarRowActions>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          aria-label={t("chat.row_more_aria", "Chat actions")}
                          className="h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-foreground"
                          title={t("chat.row_more_aria", "Chat actions")}
                          type="button"
                          variant="ghost"
                          {...shellSecondaryNavItemProps}
                        >
                          <MoreHorizontal aria-hidden className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className={sidebarDenseMenuContentClassName}
                      >
                        <DropdownMenuItem
                          className={sidebarDenseMenuItemClassName}
                          {...shellSecondaryNavItemProps}
                          onSelect={(e) =>
                            handleRename(e as any, thread.id, title)
                          }
                        >
                          <Edit2 className="mr-2 h-3.5 w-3.5" />
                          <span>{t("chat.rename", "Rename")}</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className={sidebarDenseMenuItemClassName}
                          {...shellSecondaryNavItemProps}
                          onSelect={(e) => handleDelete(e as any, thread.id)}
                        >
                          <Trash2 className="mr-2 h-3.5 w-3.5" />
                          <span>{t("chat.delete", "Delete")}</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </SidebarRowActions>
                </SidebarRow>
              );
            })
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
