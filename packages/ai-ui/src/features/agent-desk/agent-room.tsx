"use client";

// A room as its own page (`/s/<key>/rooms/<threadId>`): the conversation its
// agents and people hold, named as itself. It is not a desk — no agent's
// identity heads it, no agent's skills or runs sit beside it — and the agent
// whose desk lists it first (the host, the thread's `agent_id`) is only how
// turns are run: a person's words go to the host, who relays `@mentions`
// (PLAN-agent-rooms.md). So the chat below is the host's lane, on the room's
// thread, under the room's own host key.
//
// The breadcrumb is the room's cluster and name; the name opens the info
// drawer (members, people, purpose, visibility), the chevron lists every
// conversation of the Space.
import { spaceRoomPathname } from "@engenty/ai-core/browser";
import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn, topbarIconButtonClassName } from "@engenty/ui-core";
import {
  type PageBreadcrumb,
  usePageConfig,
  useWorkspaceContext,
} from "@engenty/ui-plugin-sdk";
import { Info, PauseCircle } from "lucide-react";
import { type ReactNode, useCallback, useMemo } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import {
  ArtifactPaneToggle,
  WorkspaceArtifactPane,
} from "../../artifacts/workspace-artifact-pane.js";
import { alterEgoLabel } from "../../components/alter-ego-label.js";
import {
  type ChatSpaceAudience,
  ChatVisibilityBand,
  ChatVisibilityMarker,
  chatVisibilityOf,
} from "../../components/copilot/chat-visibility.js";
import type { MentionRefSearch } from "../../components/copilot/composer/use-copilot-composer-mention.js";
import { ThreadContextToggle } from "../../components/copilot/thread-context/thread-context-toggle.js";
import { EngentyCluster } from "../../components/engenty-cluster.js";
import { resolvePendingHostMessage } from "../../copilot/host-message-handoff.js";
import { ObjectDisplayIntentProvider } from "../../objects/object-display-intent.js";
import { AgentDeskChat } from "./agent-desk-chat.js";
import { AgentDeskDrawerShell } from "./agent-desk-drawer.js";
import {
  type AgentDeskSwitchAgent,
  AgentDeskSwitcher,
  type AgentDeskSwitchRoom,
} from "./agent-desk-switcher.js";
import { agentRoomHostKey } from "./agent-desk-url.js";
import {
  type AgentDeskSpacePerson,
  AgentRoomInfoPanel,
} from "./agent-room-info-panel.js";
import {
  useContinueRoomMutation,
  useRoomMembersQuery,
  useRoomPeopleQuery,
  useRoomStateQuery,
  useRoomThreadQuery,
  useSpaceConversationsQuery,
} from "./conversation-api.js";
import { useAgentDeskFeed } from "./use-agent-desk-feed.js";
import { useDeskObjectDisplayIntent } from "./use-desk-object-display-intent.js";

const NO_BREADCRUMBS: PageBreadcrumb[] = [];
const NO_ROSTER: readonly AgentDeskSwitchAgent[] = [];
const NO_PEOPLE: readonly AgentDeskSpacePerson[] = [];

/** The drawer's URL key; anything else is no drawer. */
const ROOM_PANEL = "info";

function RoomMessage({
  children,
  tone = "muted",
}: {
  children: string;
  tone?: "error" | "muted";
}) {
  return (
    <div className="grid min-h-48 place-items-center px-page text-center">
      <p
        className={
          tone === "error"
            ? "text-destructive text-sm"
            : "text-muted-foreground text-sm"
        }
      >
        {children}
      </p>
    </div>
  );
}

/**
 * The rooms the switcher lists, drawn with their agents' engenties. Members
 * are resolved against the roster; an agent no longer in the Space draws as
 * the default blob rather than dropping out of the cluster.
 */
export function switchRoomsFrom(
  rooms: readonly {
    members: readonly { agent_id: string }[];
    session: { id: string; title: string | null; visibility?: string | null };
  }[],
  roster: readonly AgentDeskSwitchAgent[]
): AgentDeskSwitchRoom[] {
  const byId = new Map(roster.map((agent) => [agent.id, agent]));
  return rooms.map((room) => ({
    id: room.session.id,
    kinds: room.members.map(
      (member) => byId.get(member.agent_id)?.engenty ?? "round"
    ),
    title:
      room.session.title?.trim() ||
      room.members
        .map((member) => byId.get(member.agent_id)?.name ?? member.agent_id)
        .join(", "),
    visibility: room.session.visibility ?? null,
  }));
}

export function AgentRoom(props: {
  /** Room management beyond one's own rooms — the space's admins. */
  canManage: boolean;
  /** Composer control left of the attach (+) menu — the effort chooser. */
  composerLeadingControl?: ReactNode;
  /** `@` candidates for the composer — the Space's people and other agents. */
  mentionRefSearch?: MentionRefSearch;
  rosterAgents?: readonly AgentDeskSwitchAgent[];
  /** How far the Space itself reaches — what "open to the Space" means here. */
  spaceAudience?: ChatSpaceAudience | null;
  spaceId: string;
  spaceKey: string;
  spacePeople?: readonly AgentDeskSpacePerson[];
  threadId: string;
}) {
  const {
    composerLeadingControl,
    mentionRefSearch,
    rosterAgents = NO_ROSTER,
    spaceAudience,
    spaceId,
    spaceKey,
    spacePeople = NO_PEOPLE,
    threadId,
  } = props;
  const { i18n } = useTranslation("common");
  const { t } = useTranslation("ai-ui");
  const locale = i18n.language || "en";
  const { currentUserId } = useWorkspaceContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const hostKey = agentRoomHostKey(spaceId, threadId);
  const objectDisplayIntent = useDeskObjectDisplayIntent(hostKey);
  // A message written somewhere else and sent here — the Space home's card
  // composer (PLAN-space-home.md H5). Same handoff a desk uses.
  const location = useLocation();
  const pendingSubmit = resolvePendingHostMessage(hostKey, location.state);
  const roomQuery = useRoomThreadQuery(threadId);
  const room = roomQuery.data ?? null;
  const hostAgentId = room?.agent_id ?? "";
  // The host's record, for the chat lane's own needs (its skills feed the
  // slash catalogue, its role the sender labels). Nothing of it is shown as
  // the page.
  const hostQuery = useAgentDeskFeed({
    agentId: hostAgentId,
    enabled: Boolean(hostAgentId),
    locale,
    spaceId,
  });
  const membersQuery = useRoomMembersQuery(threadId);
  const peopleQuery = useRoomPeopleQuery(threadId);
  const stateQuery = useRoomStateQuery(threadId);
  const conversationsQuery = useSpaceConversationsQuery(spaceId);
  const continueRoom = useContinueRoomMutation(threadId);
  const panelOpen = searchParams.get("panel") === ROOM_PANEL;
  const openPanel = useCallback(() => {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      params.set("panel", ROOM_PANEL);
      return params;
    });
  }, [setSearchParams]);
  const closePanel = useCallback(() => {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      params.delete("panel");
      return params;
    });
  }, [setSearchParams]);

  const members = membersQuery.data ?? [];
  const byId = useMemo(
    () => new Map(rosterAgents.map((agent) => [agent.id, agent])),
    [rosterAgents]
  );
  const kinds = useMemo(
    () =>
      members.map((member) => byId.get(member.agent_id)?.engenty ?? "round"),
    [byId, members]
  );
  const title =
    room?.title?.trim() ||
    members
      .map((member) =>
        member.on_behalf_of_user_name
          ? alterEgoLabel(member.on_behalf_of_user_name, t)
          : (byId.get(member.agent_id)?.name ?? member.agent_id)
      )
      .join(", ");
  // Its members only, or as wide as the Space (open — or, in a private
  // Space, as far as that Space's people reach).
  const visibility = chatVisibilityOf(
    "room",
    stateQuery.data?.visibility,
    spaceAudience
  );
  // Their own room is theirs to run; the space's admins run every room.
  const canManage =
    props.canManage ||
    (Boolean(currentUserId) && room?.created_by_user_id === currentUserId);

  const breadcrumbs = useMemo((): PageBreadcrumb[] => {
    if (!room) {
      return NO_BREADCRUMBS;
    }
    return [
      {
        compactKept: true,
        label: (
          <AgentDeskSwitcher
            agents={rosterAgents}
            current={{ id: threadId, kind: "room" }}
            label={
              <button
                aria-label={t("agentDesk.roomInfo.open")}
                className="flex min-w-0 items-center gap-1.5 rounded-sm font-medium text-foreground text-sm hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                data-testid="agent-room-crumb"
                onClick={openPanel}
                type="button"
              >
                <EngentyCluster kinds={kinds} size={22} />
                <ChatVisibilityMarker kind="room" visibility={visibility} />
                <span className="min-w-0 truncate">{title}</span>
              </button>
            }
            rooms={switchRoomsFrom(
              conversationsQuery.data?.rooms ?? [],
              rosterAgents
            )}
            spaceAudience={spaceAudience}
            spaceKey={spaceKey}
          />
        ),
        menuLabel: title,
        to: spaceRoomPathname(spaceKey, threadId),
      },
    ];
  }, [
    conversationsQuery.data?.rooms,
    kinds,
    openPanel,
    room,
    rosterAgents,
    spaceKey,
    t,
    threadId,
    title,
    visibility,
  ]);

  // The pane and context toggles read the host the chat registers under this
  // key, so they exist only once the chat can mount — a toggle without its
  // EngentyAgent boundary throws.
  const actions =
    room && hostQuery.data ? (
      <div className="flex items-center gap-0.5">
        <Button
          aria-label={t("agentDesk.roomInfo.open")}
          className={cn(
            topbarIconButtonClassName,
            // Square hit-target: the contentBlend topbar forces `!px-2` on
            // buttons, which leaves a wide empty gap on an icon-only one.
            "!size-7 !w-7 !min-w-7 !px-0"
          )}
          data-testid="agent-room-info-button"
          onClick={openPanel}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Info className="size-4" />
        </Button>
        <ThreadContextToggle hostKey={hostKey} />
        <ArtifactPaneToggle
          hostKey={hostKey}
          scope={{ id: threadId, type: "thread" }}
        />
      </div>
    ) : null;

  usePageConfig({
    actions,
    breadcrumbs,
    contentStackBackground: "paper",
    topbarOverlap: true,
  });

  if (roomQuery.isPending || (hostAgentId && hostQuery.isPending)) {
    return <RoomMessage>{t("agentDesk.roomInfo.loading")}</RoomMessage>;
  }
  if (roomQuery.isError || !room) {
    return (
      <RoomMessage tone="error">
        {roomQuery.error instanceof Error
          ? roomQuery.error.message
          : t("agentDesk.roomInfo.loadFailed")}
      </RoomMessage>
    );
  }
  if (room.route_context?.room !== true || room.space_id !== spaceId) {
    return (
      <RoomMessage tone="error">{t("agentDesk.roomInfo.notARoom")}</RoomMessage>
    );
  }
  if (hostQuery.isError || !hostQuery.data) {
    return (
      <RoomMessage tone="error">
        {hostQuery.error instanceof Error
          ? hostQuery.error.message
          : t("agentDesk.roomInfo.loadFailed")}
      </RoomMessage>
    );
  }
  const host = hostQuery.data.agent;
  const paused = stateQuery.data?.paused === true;

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      {/* The band the desk header collapses to, always up here: a room has
          no identity block — the crumb names it, and the transparent topbar
          (h-11) floats over the band's first row. It states who reads: its
          members, counted (agents and people), or everyone in the Space. */}
      <div data-testid="agent-room-readers-bar">
        <ChatVisibilityBand
          gutterClassName="px-4 pb-2"
          kind="room"
          lastActivityAt={room?.updated_at ?? null}
          memberCount={
            stateQuery.data?.visibility === "private"
              ? members.length + (peopleQuery.data?.length ?? 0)
              : spaceAudience?.peopleCount
          }
          visibility={visibility}
        />
      </div>
      {paused ? (
        <div
          className="flex flex-wrap items-center gap-2 border-border-soft border-b px-4 py-2 text-sm"
          data-testid="agent-desk-room-paused"
        >
          <PauseCircle className="size-4 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            {t("agentDesk.room.paused", {
              count: stateQuery.data?.agentTurns ?? 0,
            })}
          </span>
          <Button
            disabled={continueRoom.isPending}
            onClick={() => continueRoom.mutate()}
            size="sm"
            variant="outline"
          >
            {t("agentDesk.room.continue")}
          </Button>
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Records the host or a colleague shows open in the pane beside the
            room, same as on a desk. */}
        <ObjectDisplayIntentProvider value={objectDisplayIntent}>
          <AgentDeskChat
            agentConnectors={host.connectors}
            agentDescription={host.description}
            agentEngenty={host.engenty}
            agentId={host.id}
            agentName={host.name}
            agentRole={host.role}
            agentScope={host.agentScope}
            agentSkills={host.skills}
            agentStarters={host.starters}
            composerLeadingControl={composerLeadingControl}
            composerPlaceholder={t("agentDesk.roomInfo.composerPlaceholder", {
              title,
            })}
            hostKey={hostKey}
            mentionRefSearch={mentionRefSearch}
            // A room exists before anyone speaks in it; nothing is created here.
            onThreadCreated={() => undefined}
            pendingSubmit={pendingSubmit}
            spaceId={spaceId}
            starters={false}
            threadId={threadId}
          />
        </ObjectDisplayIntentProvider>
      </div>
      <WorkspaceArtifactPane
        hostKey={hostKey}
        scope={{ id: threadId, type: "thread" }}
      />
      <AgentDeskDrawerShell
        onClose={closePanel}
        open={panelOpen}
        title={t("agentDesk.roomInfo.title")}
      >
        <AgentRoomInfoPanel
          canManage={canManage}
          members={members}
          rosterAgents={rosterAgents}
          spacePeople={spacePeople}
          state={stateQuery.data ?? null}
          threadId={threadId}
          title={title}
        />
      </AgentDeskDrawerShell>
    </div>
  );
}
