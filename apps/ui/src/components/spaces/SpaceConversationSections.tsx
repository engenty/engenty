/**
 * The conversation list of the Work tab (PLAN-agent-rooms.md §10): Favoriten
 * on top, then this person's sections, then the built-ins — Agenten (the
 * desks, which are the roster), Räume (the rooms they are in),
 * Direktnachrichten (their DMs). Every row is a conversation; an agent is
 * here through its desk.
 *
 * Owns what the rows share: the actions context, the drag context, the
 * name dialog and the new-room dialog. `slots.favorites` lets the caller
 * place Favoriten above Inbox while the sections follow it.
 */
import {
  AgentDeskNewRoomDialog,
  type AgentDeskSwitchAgent,
  conversationEngagement,
  useOpenDmMutation,
} from "@engenty/ai-ui";
import { useTranslation } from "@engenty/i18n/ui";
import { useWorkspaceContext } from "@engenty/ui-plugin-sdk";
import type { ConversationNavItem } from "@engenty/user-settings";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { arrayMoveIds } from "@/lib/space-agent-nav-order";
import {
  builtInSectionFor,
  type SpaceConversationItem,
} from "@/lib/space-conversation-sections";
import { spaceAgentDeskPath, spaceRoomPath } from "@/lib/space-routes";
import { useSpaceConversationSidebar } from "@/lib/use-space-conversation-sidebar";
import { useSpaceRosterAgents } from "@/lib/use-space-roster-agents";
import { SpaceConversationSection } from "./SpaceConversationSection";
import { FAVORITES_CONTAINER_ID, SpaceFavorites } from "./SpaceFavorites";
import { SpaceNameDialog } from "./SpaceNameDialog";
import {
  SpaceConversationDnd,
  type SpaceConversationDrop,
} from "./space-conversation-dnd";
import {
  type SpaceConversationSidebarActions,
  SpaceConversationSidebarProvider,
  type SpaceNameDialogRequest,
} from "./space-conversation-sidebar-context";

export function SpaceConversationSections({
  canAdd,
  canManage,
  children,
  spaceId,
  spaceKey,
}: {
  /** The "+" on Agenten and Räume. Absent when the viewer cannot hire. */
  canAdd: boolean;
  /** Hired-agent removal and room management beyond one's own rooms. */
  canManage: boolean;
  /**
   * Rendered between Favoriten and the sections — Inbox sits there. A render
   * prop, because both halves must live inside one drag context.
   */
  children?: ReactNode;
  spaceId: string | null;
  spaceKey: string;
}) {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const { currentUserId } = useWorkspaceContext();
  const sidebar = useSpaceConversationSidebar(spaceId);
  const { agents: rosterAgents } = useSpaceRosterAgents(spaceId);
  const rosterById = useMemo(
    () => new Map(rosterAgents.map((agent) => [agent.id, agent])),
    [rosterAgents]
  );
  const openDm = useOpenDmMutation();
  const [nameRequest, setNameRequest] = useState<SpaceNameDialogRequest | null>(
    null
  );
  const [newRoom, setNewRoom] = useState<{
    host: AgentDeskSwitchAgent | undefined;
  } | null>(null);

  const { model } = sidebar;
  const pinnedKeys = useMemo(
    () => new Set(model.favorites.map((item) => item.key)),
    [model.favorites]
  );
  const containers = useMemo(() => {
    const map = new Map<string, readonly ConversationNavItem[]>();
    map.set(
      FAVORITES_CONTAINER_ID,
      model.favorites.map((item) => item.key)
    );
    for (const section of model.sections) {
      map.set(
        section.id,
        section.items.map((item) => item.key)
      );
    }
    return map;
  }, [model]);
  const itemsByKey = useMemo(() => {
    const map = new Map<string, SpaceConversationItem>();
    for (const item of model.favorites) {
      map.set(item.key, item);
    }
    for (const section of model.sections) {
      for (const item of section.items) {
        map.set(item.key, item);
      }
    }
    return map;
  }, [model]);

  const onDrop = useCallback(
    (drop: SpaceConversationDrop) => {
      const item = itemsByKey.get(drop.item);
      if (!item) {
        return;
      }
      const target = containers.get(drop.toContainer) ?? [];
      const insert = (list: readonly ConversationNavItem[]) => {
        const without = list.filter((key) => key !== drop.item);
        const next = [...without];
        next.splice(Math.min(drop.toIndex, next.length), 0, drop.item);
        return next;
      };
      if (drop.toContainer === FAVORITES_CONTAINER_ID) {
        if (drop.fromContainer !== FAVORITES_CONTAINER_ID) {
          sidebar.pin(drop.item);
        }
        sidebar.reorderPinned(insert(target));
        return;
      }
      if (drop.fromContainer === FAVORITES_CONTAINER_ID) {
        sidebar.unpin(drop.item);
      }
      if (drop.fromContainer === drop.toContainer) {
        const overKey = target[drop.toIndex];
        sidebar.reorderItems(
          drop.toContainer,
          overKey
            ? (arrayMoveIds(
                target,
                drop.item,
                overKey
              ) as ConversationNavItem[])
            : [...target]
        );
        return;
      }
      sidebar.moveTo(
        drop.item,
        drop.toContainer === builtInSectionFor(item.kind)
          ? null
          : drop.toContainer
      );
      sidebar.reorderItems(drop.toContainer, insert(target));
    },
    [containers, itemsByKey, sidebar]
  );

  const actions = useMemo<SpaceConversationSidebarActions | null>(() => {
    if (!spaceId) {
      return null;
    }
    return {
      canManage,
      createSection: sidebar.createSection,
      currentUserId: currentUserId ?? null,
      deleteSection: sidebar.deleteSection,
      hide: sidebar.hide,
      moveTo: sidebar.moveTo,
      openDm: (agentId) => {
        openDm.mutate(
          { agentId, spaceId },
          {
            onSuccess: (result) =>
              navigate(
                `${spaceAgentDeskPath(spaceKey, agentId)}?engagement=${encodeURIComponent(conversationEngagement(result.session.id))}`
              ),
          }
        );
      },
      openNameDialog: setNameRequest,
      openNewRoom: (host) => setNewRoom({ host }),
      personalSections: sidebar.personalSections,
      pin: sidebar.pin,
      renameSection: sidebar.renameSection,
      spaceId,
      spaceKey,
      unpin: sidebar.unpin,
    };
  }, [canManage, currentUserId, navigate, openDm, sidebar, spaceId, spaceKey]);

  if (!(spaceId && actions)) {
    return <>{children}</>;
  }

  return (
    <SpaceConversationSidebarProvider value={actions}>
      <SpaceConversationDnd containers={containers} onDrop={onDrop}>
        <SpaceFavorites
          items={model.favorites}
          rosterById={rosterById}
          spaceKey={spaceKey}
        />
        {children}
        {sidebar.isPending &&
        model.sections.every((s) => s.items.length === 0) ? (
          <div className="flex flex-col gap-1">
            {[0, 1].map((index) => (
              <div
                className="h-10 animate-pulse rounded-[8px] bg-muted"
                key={index}
              />
            ))}
          </div>
        ) : null}
        {model.sections.map((section) => (
          <SpaceConversationSection
            canAdd={canAdd}
            key={section.id}
            pinnedKeys={pinnedKeys}
            rosterAgents={rosterAgents}
            rosterById={rosterById}
            section={section}
            spaceId={spaceId}
            spaceKey={spaceKey}
          />
        ))}
      </SpaceConversationDnd>
      <SpaceNameDialog
        onOpenChange={(open) => {
          if (!open) {
            setNameRequest(null);
          }
        }}
        request={nameRequest}
      />
      {newRoom ? (
        <AgentDeskNewRoomDialog
          {...(newRoom.host ? { host: newRoom.host } : {})}
          onCreated={(threadId) => navigate(spaceRoomPath(spaceKey, threadId))}
          onOpenChange={(open) => {
            if (!open) {
              setNewRoom(null);
            }
          }}
          open
          rosterAgents={rosterAgents}
          spaceId={spaceId}
        />
      ) : null}
      <span className="sr-only">
        {t("spaces.conversations.list", { defaultValue: "Conversations" })}
      </span>
    </SpaceConversationSidebarProvider>
  );
}
