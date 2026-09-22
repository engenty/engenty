/**
 * The overflow of one conversation row — desk, room or DM — with the items
 * its kind allows (PLAN-agent-rooms.md §10.3): pin, file into a section,
 * open a DM or a room with this agent, rename, change who may see a room,
 * hide, leave, copy an id, remove a hired agent, archive.
 *
 * Same ⋮ trigger the Data tree uses (`data-row-menu-trigger`) so a row
 * right-click can open it.
 */
import {
  AgentRemovalDialog,
  useLeaveRoomMutation,
  useUpdateRoomMutation,
} from "@engenty/ai-ui";
import { deleteAppsAiThread, useEngentyAIContext } from "@engenty/ai-ui/embed";
import { useTranslation } from "@engenty/i18n/ui";
import { useQueryClient } from "@engenty/query-client";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@engenty/ui-core";
import {
  Archive,
  Check,
  Copy,
  EyeOff,
  FolderInput,
  FolderPlus,
  Globe,
  Lock,
  LogOut,
  MoreVertical,
  Pencil,
  Pin,
  PinOff,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { resolveSpaceAgentKind } from "@/lib/space-agent-nav";
import {
  builtInSectionFor,
  isRiverItem,
  type SpaceConversationItem,
} from "@/lib/space-conversation-sections";
import { useSpaceConversationSidebarActions } from "./space-conversation-sidebar-context";

const COPIED_RESET_MS = 1500;

export function openSpaceConversationNavMenu(event: {
  currentTarget: HTMLElement;
}) {
  const trigger = event.currentTarget.querySelector<HTMLElement>(
    "[data-row-menu-trigger]"
  );
  trigger?.click();
}

export function SpaceConversationNavMenu({
  isPinned,
  item,
  /** The section the row sits in now: a personal id or a built-in. */
  sectionId,
}: {
  isPinned: boolean;
  item: SpaceConversationItem;
  sectionId: string;
}) {
  const { t } = useTranslation("common");
  const actions = useSpaceConversationSidebarActions();
  const queryClient = useQueryClient();
  const { serviceBaseUrl } = useEngentyAIContext();
  const [copied, setCopied] = useState(false);
  const [removing, setRemoving] = useState(false);
  const copiedTimer = useRef<number | null>(null);
  const threadId =
    item.kind === "desk" ? null : item.key.slice("thread:".length);
  const leaveRoom = useLeaveRoomMutation();
  const updateRoom = useUpdateRoomMutation(threadId ?? "");
  // The river: pinned by nature, filed nowhere, never hidden or archived. Only
  // its id is worth a menu item, and the page itself offers that.
  const river = isRiverItem(item);

  useEffect(
    () => () => {
      if (copiedTimer.current !== null) {
        window.clearTimeout(copiedTimer.current);
      }
    },
    []
  );

  const copyId = useCallback(() => {
    const id = item.kind === "desk" ? item.agent.id : threadId;
    void navigator.clipboard?.writeText(id ?? "");
    setCopied(true);
    if (copiedTimer.current !== null) {
      window.clearTimeout(copiedTimer.current);
    }
    copiedTimer.current = window.setTimeout(
      () => setCopied(false),
      COPIED_RESET_MS
    );
  }, [item, threadId]);

  const archive = useCallback(() => {
    if (!threadId) {
      return;
    }
    void deleteAppsAiThread({ serviceBaseUrl, threadId }).then(() => {
      queryClient.invalidateQueries({ queryKey: ["rooms", "list"] });
      queryClient.invalidateQueries({ queryKey: ["apps-ai", "threads"] });
    });
  }, [queryClient, serviceBaseUrl, threadId]);

  const builtIn = builtInSectionFor(item.kind);
  const builtInLabel = t(`spaces.conversations.${builtIn}`, {
    defaultValue: builtIn,
  });
  const agent =
    item.kind === "desk" ? item.agent : item.kind === "dm" ? item.agent : null;
  const canRemoveAgent =
    item.kind === "desk" &&
    actions.canManage &&
    resolveSpaceAgentKind(item.agent) === "hired";
  const isOwner =
    item.kind !== "desk" &&
    item.kind !== "dm" &&
    item.room.session.created_by_user_id === actions.currentUserId;
  const canManageRoom = item.kind === "room" && (isOwner || actions.canManage);
  const canArchive =
    (item.kind === "room" && isOwner) ||
    (item.kind === "dm" &&
      item.dm.session.created_by_user_id === actions.currentUserId);

  const moveToLabel = (id: string | null) =>
    id === null
      ? builtInLabel
      : (actions.personalSections.find((section) => section.id === id)?.name ??
        id);

  if (river) {
    return null;
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={t("actions.more", { defaultValue: "More actions" })}
            className="size-7 shrink-0 bg-transparent p-0 text-muted-foreground opacity-0 transition-opacity hover:bg-transparent hover:text-foreground focus-visible:opacity-100 group-focus-within/item:opacity-100 group-hover/item:opacity-100 data-[state=open]:bg-transparent data-[state=open]:opacity-100"
            data-row-menu-trigger
            onPointerDown={(event) => event.stopPropagation()}
            size="icon"
            variant="ghost"
          >
            <MoreVertical aria-hidden className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="min-w-[12rem]"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <DropdownMenuItem
            onSelect={() =>
              isPinned ? actions.unpin(item.key) : actions.pin(item.key)
            }
          >
            {isPinned ? (
              <PinOff className="mr-2 size-4" />
            ) : (
              <Pin className="mr-2 size-4" />
            )}
            {isPinned
              ? t("spaces.conversations.unpin", { defaultValue: "Unpin" })
              : t("spaces.conversations.pin", { defaultValue: "Pin" })}
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <FolderInput className="mr-2 size-4" />
              {t("spaces.conversations.moveTo", { defaultValue: "Move to" })}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="min-w-[10rem]">
              {actions.personalSections.map((section) => (
                <DropdownMenuItem
                  key={section.id}
                  onSelect={() => actions.moveTo(item.key, section.id)}
                >
                  {sectionId === section.id ? (
                    <Check className="mr-2 size-4" />
                  ) : (
                    <span className="mr-2 size-4" />
                  )}
                  {section.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem onSelect={() => actions.moveTo(item.key, null)}>
                {sectionId === builtIn ? (
                  <Check className="mr-2 size-4" />
                ) : (
                  <span className="mr-2 size-4" />
                )}
                {moveToLabel(null)}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() =>
                  actions.openNameDialog({
                    label: t("spaces.conversations.sectionNameLabel", {
                      defaultValue: "Name",
                    }),
                    onSubmit: (name) => {
                      const id = actions.createSection(name);
                      actions.moveTo(item.key, id);
                    },
                    submitLabel: t("spaces.conversations.createSection", {
                      defaultValue: "Create section",
                    }),
                    title: t("spaces.conversations.newSectionTitle", {
                      defaultValue: "New section",
                    }),
                  })
                }
              >
                <FolderPlus className="mr-2 size-4" />
                {t("spaces.conversations.newSection", {
                  defaultValue: "New section…",
                })}
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          {agent && item.kind !== "dm" ? (
            <DropdownMenuItem onSelect={() => actions.openDm(agent.id)}>
              <Lock className="mr-2 size-4" />
              {t("spaces.conversations.openDm", {
                defaultValue: "Direct message",
              })}
            </DropdownMenuItem>
          ) : null}
          {agent ? (
            <DropdownMenuItem onSelect={() => actions.openNewRoom(agent)}>
              <Users className="mr-2 size-4" />
              {t("spaces.conversations.newRoomWith", {
                defaultValue: "New group chat with {{name}}",
                name: agent.name,
              })}
            </DropdownMenuItem>
          ) : null}
          {item.kind === "room" && canManageRoom ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() =>
                  actions.openNameDialog({
                    initial: item.room.session.title ?? "",
                    label: t("spaces.conversations.roomTitleLabel", {
                      defaultValue: "Title",
                    }),
                    onSubmit: (title) => updateRoom.mutate({ title }),
                    submitLabel: t("actions.save", { defaultValue: "Save" }),
                    title: t("spaces.conversations.renameRoom", {
                      defaultValue: "Rename room",
                    }),
                  })
                }
              >
                <Pencil className="mr-2 size-4" />
                {t("spaces.conversations.rename", { defaultValue: "Rename" })}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  updateRoom.mutate({
                    visibility:
                      item.room.session.visibility === "private"
                        ? "space"
                        : "private",
                  })
                }
              >
                {item.room.session.visibility === "private" ? (
                  <Globe className="mr-2 size-4" />
                ) : (
                  <Lock className="mr-2 size-4" />
                )}
                {item.room.session.visibility === "private"
                  ? t("spaces.conversations.makeVisible", {
                      defaultValue: "Visible to the space",
                    })
                  : t("spaces.conversations.makePrivate", {
                      defaultValue: "Private to its members",
                    })}
              </DropdownMenuItem>
            </>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem closeOnClick={false} onSelect={copyId}>
            {copied ? (
              <Check className="mr-2 size-4" />
            ) : (
              <Copy className="mr-2 size-4" />
            )}
            {copied
              ? t("spaces.agents.copiedId", { defaultValue: "Copied" })
              : item.kind === "desk"
                ? t("spaces.agents.copyId", { defaultValue: "Copy agent ID" })
                : t("spaces.conversations.copyThreadId", {
                    defaultValue: "Copy conversation ID",
                  })}
          </DropdownMenuItem>
          {item.kind === "desk" ? null : (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => actions.hide(item.key)}>
                <EyeOff className="mr-2 size-4" />
                {t("spaces.conversations.hide", {
                  defaultValue: "Hide from sidebar",
                })}
              </DropdownMenuItem>
              {item.kind === "room" && !isOwner && actions.currentUserId ? (
                <DropdownMenuItem
                  onSelect={() =>
                    leaveRoom.mutate({
                      threadId: item.room.session.id,
                      userId: actions.currentUserId as string,
                    })
                  }
                >
                  <LogOut className="mr-2 size-4" />
                  {t("spaces.conversations.leave", { defaultValue: "Leave" })}
                </DropdownMenuItem>
              ) : null}
              {canArchive ? (
                <DropdownMenuItem onSelect={archive} variant="destructive">
                  <Archive className="mr-2 size-4" />
                  {t("spaces.conversations.archive", {
                    defaultValue: "Archive",
                  })}
                </DropdownMenuItem>
              ) : null}
            </>
          )}
          {canRemoveAgent ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => setRemoving(true)}
                variant="destructive"
              >
                <LogOut className="mr-2 size-4" />
                {t("spaces.agents.removeFromSpace", {
                  defaultValue: "Remove from space",
                })}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {removing && item.kind === "desk" ? (
        <AgentRemovalDialog
          agentId={item.agent.id}
          agentName={item.agent.name}
          mode="unmount"
          onOpenChange={(open) => {
            if (!open) {
              setRemoving(false);
            }
          }}
          open
          spaceId={actions.spaceId}
          spaceKey={actions.spaceKey}
        />
      ) : null}
    </>
  );
}
