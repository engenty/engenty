import { spaceRoomPathname } from "@engenty/ai-core/browser";
import { useTranslation } from "@engenty/i18n/ui";
import type { PageBreadcrumb } from "@engenty/ui-plugin-sdk";
import {
  type ReactNode,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Navigate,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { AgentFace } from "../../components/agent-face.js";
import {
  type ChatKind,
  useChatKindCopy,
} from "../../components/copilot/chat-kind-badge.js";
import {
  type ChatSpaceAudience,
  type ChatVisibility,
  chatVisibilityOf,
  useChatVisibilityCopy,
} from "../../components/copilot/chat-visibility.js";
import type { MentionRefSearch } from "../../components/copilot/composer/use-copilot-composer-mention.js";
import {
  clearPendingHostMessage,
  pendingHostMessageFromState,
  resolvePendingHostMessage,
  writePendingHostMessage,
} from "../../copilot/host-message-handoff.js";
import {
  ThreadChapterCard,
  ThreadChaptersMenu,
} from "../../copilot/thread-chapters.js";
import { AgentDeskActions } from "./agent-desk-actions.js";
import { AgentDeskChat } from "./agent-desk-chat.js";
import {
  canManageAgent,
  isAgentDeskChatSurface,
  resolveAgentDeskDefault,
} from "./agent-desk-defaults.js";
import { AgentDeskEngagementList } from "./agent-desk-engagement-list.js";
import type { AgentDeskRelation } from "./agent-desk-header.js";
import { AgentDeskNewRoomDialog } from "./agent-desk-new-room-dialog.js";
import {
  type AgentDeskSwitchAgent,
  AgentDeskSwitcher,
} from "./agent-desk-switcher.js";
import {
  agentDeskHostKey,
  conversationEngagement,
  threadIdFromEngagement,
} from "./agent-desk-url.js";
import { switchRoomsFrom } from "./agent-room.js";
import {
  useOpenDmMutation,
  useSpaceConversationsQuery,
} from "./conversation-api.js";
import { DeskFrame, DeskMessage, DeskPageBody } from "./desk-frame.js";
import { useAgentDeskFeed } from "./use-agent-desk-feed.js";
import { useAgentDeskPanel } from "./use-agent-desk-panel.js";
import { useDeskObjectDisplayIntent } from "./use-desk-object-display-intent.js";

const NO_BREADCRUMBS: PageBreadcrumb[] = [];
const NO_ROSTER: readonly AgentDeskSwitchAgent[] = [];

export function AgentDesk(props: {
  agentId: string;
  canManageAgents: boolean;
  /**
   * Composer control left of the attach (+) menu. The effort chooser lives in
   * the copilot module, which `ai-ui` cannot import — the app injects it so a
   * specialist's composer offers the same control the copilot's does.
   */
  composerLeadingControl?: ReactNode;
  /**
   * `@` candidates for the composer — the Space's people and other agents.
   * Injected for the same reason: the Space roster is the app's query.
   */
  mentionRefSearch?: MentionRefSearch;
  /**
   * Display name of the agent's module, as the space sidebar labels it.
   * Injected: module labels come from the app's UI contributions.
   */
  moduleLabel?: string;
  /**
   * The Space's agent roster for the breadcrumb switcher. Injected: the
   * roster is the app's query, shared with its sidebar.
   */
  /**
   * Where this agent stands in the Space's team — manager, reports,
   * coordinator. Injected: `reports_to` lives on the space's mount rows,
   * which are the app's query.
   */
  relation?: AgentDeskRelation | null;
  rosterAgents?: readonly AgentDeskSwitchAgent[];
  /** How far the Space itself reaches — what a desk "everyone reads" means. */
  spaceAudience?: ChatSpaceAudience | null;
  spaceId: string;
  spaceKey: string;
  /** The Space's display name — the shared desk's badge says whose team reads. */
  spaceName?: string | null;
}) {
  const {
    agentId,
    canManageAgents,
    composerLeadingControl,
    mentionRefSearch,
    moduleLabel,
    relation,
    rosterAgents = NO_ROSTER,
    spaceAudience,
    spaceId,
    spaceKey,
    spaceName,
  } = props;
  const { i18n } = useTranslation("common");
  const { t } = useTranslation("ai-ui");
  const locale = i18n.language || "en";
  const feedQuery = useAgentDeskFeed({ agentId, locale, spaceId });
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const hostKey = agentDeskHostKey(spaceId, agentId);
  const pendingSubmit = resolvePendingHostMessage(hostKey, location.state);
  const deferredCreatedThreadId = useRef<string | null>(null);
  const bindCreatedThread = useCallback(
    (createdThreadId: string, clearParkedState: boolean) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.set("engagement", conversationEngagement(createdThreadId));
          next.delete("action");
          return next;
        },
        clearParkedState ? { replace: true, state: {} } : { replace: true }
      );
    },
    [setSearchParams]
  );
  const consumePendingSubmit = useCallback(() => {
    clearPendingHostMessage(hostKey);
    const createdThreadId = deferredCreatedThreadId.current;
    deferredCreatedThreadId.current = null;
    if (createdThreadId) {
      bindCreatedThread(createdThreadId, true);
      return;
    }
    if (!pendingHostMessageFromState(location.state)) {
      return;
    }
    setSearchParams((current) => new URLSearchParams(current), {
      replace: true,
      state: {},
    });
  }, [bindCreatedThread, hostKey, location.state, setSearchParams]);
  useLayoutEffect(() => {
    if (pendingSubmit) {
      writePendingHostMessage(hostKey, pendingSubmit);
    }
  }, [hostKey, pendingSubmit]);
  const asking = searchParams.get("action") === "ask";
  // The drawer over the chat, if one is open. `tab` is the key links minted
  const { closePanel, openPanel, panel } = useAgentDeskPanel();
  const objectDisplayIntent = useDeskObjectDisplayIntent(hostKey);
  const deskDefault = feedQuery.data
    ? resolveAgentDeskDefault(feedQuery.data)
    : null;
  const newestConversation =
    deskDefault?.kind === "conversation" ? deskDefault.engagement : null;
  const chatSurface = Boolean(
    feedQuery.data && isAgentDeskChatSurface(feedQuery.data.agent)
  );
  // The open conversation: the one the URL names, else — on a chat desk —
  // the newest, read straight from the feed. The bare desk URL is not
  // rewritten to name it: binding it a render later, through the URL, reset
  // the lane and drew the transcript twice.
  const selected =
    searchParams.get("engagement") ??
    (chatSurface && !asking ? (newestConversation?.id ?? null) : null);
  const threadId = threadIdFromEngagement(selected);
  const [newRoomOpen, setNewRoomOpen] = useState(false);
  const openDm = useOpenDmMutation();
  // The viewer's private line with this agent: the same thread every time,
  // created on the first open, then bound like any conversation.
  const requestDm = () => {
    if (openDm.isPending) {
      return;
    }
    openDm.mutate(
      { agentId, spaceId },
      { onSuccess: (result) => bindCreatedThread(result.session.id, false) }
    );
  };
  const canManage = Boolean(
    feedQuery.data && canManageAgents && canManageAgent(feedQuery.data.agent)
  );
  const actions = feedQuery.data ? (
    <AgentDeskActions
      agentId={feedQuery.data.agent.id}
      agentName={feedQuery.data.agent.name}
      canAsk={feedQuery.data.agent.can_ask}
      canAssignWork={feedQuery.data.agent.can_assign_work}
      canManage={canManage}
      // Only a bound conversation has chapters; an engagement list has none.
      chapters={threadId ? <ThreadChaptersMenu threadId={threadId} /> : null}
      hostKey={hostKey}
      isCustomAgent={feedQuery.data.agent.source === "database"}
      locale={locale}
      {...((props.rosterAgents?.length ?? 0) > 1
        ? { onNewRoom: () => setNewRoomOpen(true) }
        : {})}
      {...(chatSurface && feedQuery.data.agent.agentScope !== "personal"
        ? { onOpenDm: requestDm }
        : {})}
      onOpenPanel={openPanel}
      spaceId={spaceId}
      spaceKey={spaceKey}
      threadId={threadId}
    />
  ) : null;
  // The agent IS the only crumb — engenty, name, and a chevron to switch to
  // another conversation of the Space — so the topbar names the desk without
  // a title band. The open thread does not follow it: a desk is one long
  // conversation, so its title names nothing you can navigate between. The
  // copilot, which really does juggle threads, still shows its thread title
  // in its own header.
  const openEngagement = feedQuery.data?.engagements.find(
    (engagement) => engagement.id === selected
  );
  // A room is its own page. A desk link that still names one — a notification,
  // a card minted before rooms had a URL — lands there.
  const openRoomPath =
    openEngagement?.metadata.room === true && threadId
      ? spaceRoomPathname(spaceKey, threadId)
      : null;
  const conversationsQuery = useSpaceConversationsQuery(spaceId);
  // What the open (or about-to-open) conversation is. A room redirects to
  // its own page; a personal agent's thread is the copilot's; a DM is the
  // viewer's line; everything else on a desk is the team's shared
  // conversation. Non-chat agents show their engagement list — no kind.
  const openEngagementIsDm = openEngagement?.metadata.dm === true;
  // Two agents talking (message_agent): the person follows it read-only.
  // The desk's controls and the host's context are about the host, not it.
  const openEngagementIsPair = openEngagement?.metadata.delegated === true;
  const chatIsConversation = Boolean(
    feedQuery.data &&
      (asking ||
        Boolean(threadId) ||
        isAgentDeskChatSurface(feedQuery.data.agent))
  );
  const chatKind: ChatKind | null = chatIsConversation
    ? feedQuery.data?.agent.agentScope === "personal"
      ? "copilot"
      : openEngagementIsDm
        ? "dm"
        : "desk"
    : null;
  // How far the conversation is visible — the header's chip and band, and
  // the topbar's tone once the private band flips the theme under it.
  const visibility: ChatVisibility | null = chatKind
    ? chatVisibilityOf(chatKind, null, spaceAudience)
    : null;
  const kindCopy = useChatKindCopy({
    kind: chatKind ?? "desk",
    name: feedQuery.data?.agent.name,
    spaceName,
  });
  const visibilityCopy = useChatVisibilityCopy({
    memberCount: spaceAudience?.peopleCount,
    name: visibility === "private" ? feedQuery.data?.agent.name : undefined,
    spaceName,
    visibility: visibility ?? "open",
  });
  // The composer says who reads before the first word is typed — the same
  // sentence the header's tier states.
  const composerPlaceholder = feedQuery.data
    ? `${t("agentDesk.composerPlaceholder", { name: feedQuery.data.agent.name })} · ${visibility ? visibilityCopy.readers : kindCopy.readers}`
    : undefined;
  const breadcrumbs = useMemo((): PageBreadcrumb[] => {
    if (!feedQuery.data) {
      return NO_BREADCRUMBS;
    }
    const { agent: current } = feedQuery.data;
    // Two agents talking: the crumb names the pair, and there is no single
    // agent's settings pane for it to open.
    const pairTitle = openEngagementIsPair ? openEngagement?.title : null;
    if (pairTitle) {
      return [
        {
          compactKept: true,
          label: (
            <span className="flex min-w-0 items-center gap-1.5 font-medium text-foreground text-sm">
              <AgentFace
                avatarUrl={current.avatarUrl}
                kind={current.engenty}
                name={current.name}
                size={20}
              />
              <span className="min-w-0 truncate">{pairTitle}</span>
            </span>
          ),
          menuLabel: pairTitle,
        },
      ];
    }
    return [
      {
        compactKept: true,
        // The name opens the agent's settings pane — the desk itself is
        // already the page, so the crumb has nowhere else to go.
        label: (
          <button
            className="flex min-w-0 items-center gap-1.5 rounded-sm font-medium text-foreground text-sm hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            onClick={() => openPanel("manage")}
            type="button"
          >
            <AgentFace
              avatarUrl={current.avatarUrl}
              kind={current.engenty}
              name={current.name}
              size={20}
            />
            <span className="min-w-0 truncate">{current.name}</span>
          </button>
        ),
        menuLabel: current.name,
      },
    ];
  }, [feedQuery.data, openEngagement?.title, openEngagementIsPair, openPanel]);
  // The conversation switcher hangs on the SPACE crumb: it lists the Space's
  // desks and rooms, so the Space is what it belongs to — the agent crumb is
  // just the name of the one that is open.
  const routeBreadcrumbAction = useMemo(
    () =>
      feedQuery.data ? (
        <AgentDeskSwitcher
          agents={rosterAgents}
          current={{ id: feedQuery.data.agent.id, kind: "agent" }}
          rooms={switchRoomsFrom(
            conversationsQuery.data?.rooms ?? [],
            rosterAgents
          )}
          spaceAudience={spaceAudience}
          spaceKey={spaceKey}
        />
      ) : null,
    [
      conversationsQuery.data?.rooms,
      feedQuery.data,
      rosterAgents,
      spaceAudience,
      spaceKey,
    ]
  );

  if (feedQuery.isPending) {
    return <DeskMessage>Loading agent desk…</DeskMessage>;
  }
  if (feedQuery.isError || !feedQuery.data) {
    return (
      <DeskMessage tone="error">
        {feedQuery.error instanceof Error
          ? feedQuery.error.message
          : "This agent desk could not be loaded."}
      </DeskMessage>
    );
  }
  if (openRoomPath) {
    return <Navigate replace to={openRoomPath} />;
  }

  const { agent, engagements } = feedQuery.data;
  const defaultEngagementId =
    deskDefault?.kind === "desk" ? deskDefault.engagement?.id : undefined;
  return (
    <>
      <DeskFrame
        actions={openEngagementIsPair ? null : actions}
        breadcrumbs={breadcrumbs}
        browserTarget={{ agentId: agent.id, spaceId }}
        canEditPads={Boolean(feedQuery.data && canManageAgents)}
        canManage={canManage}
        chapterCard={
          chatIsConversation && threadId ? (
            <ThreadChapterCard threadId={threadId} />
          ) : null
        }
        chatIsConversation={chatIsConversation}
        header={{
          agent,
          chatKind,
          hostKey,
          lastActivityAt: openEngagement?.sort_at ?? null,
          memberCount: spaceAudience?.peopleCount,
          moduleLabel,
          pairTitle: openEngagementIsPair ? openEngagement?.title : null,
          relation,
          spaceName,
          visibility: chatSurface ? visibility : null,
        }}
        hostKey={hostKey}
        locale={locale}
        objectDisplayIntent={objectDisplayIntent}
        onClosePanel={closePanel}
        panel={panel}
        routeBreadcrumbAction={routeBreadcrumbAction}
        spaceAudience={spaceAudience}
        spaceId={spaceId}
        threadId={threadId}
        visibility={visibility}
      >
        {({ onTranscriptTopVisibility, scrollHeader }) =>
          // Non-chat agents never had a chat to show; their Chat position falls
          // back to the engagement list they always had.
          chatIsConversation ? (
            <AgentDeskChat
              agentConnectors={agent.connectors}
              agentDescription={agent.description}
              agentEngenty={agent.engenty}
              agentId={agent.id}
              agentName={agent.name}
              agentRole={agent.role}
              agentScope={agent.agentScope}
              agentSkills={agent.skills}
              agentStarters={agent.starters}
              composerLeadingControl={composerLeadingControl}
              {...(composerPlaceholder ? { composerPlaceholder } : {})}
              contextPane={false}
              mentionRefSearch={mentionRefSearch}
              onPendingConsumed={consumePendingSubmit}
              onThreadCreated={(createdThreadId) => {
                if (resolvePendingHostMessage(hostKey, location.state)) {
                  deferredCreatedThreadId.current = createdThreadId;
                  return;
                }
                bindCreatedThread(createdThreadId, false);
              }}
              onTranscriptTopVisibility={onTranscriptTopVisibility}
              pendingSubmit={pendingSubmit}
              scrollHeader={scrollHeader}
              spaceId={spaceId}
              threadId={threadId}
            />
          ) : (
            <DeskPageBody>
              {engagements.length > 0 ? (
                <AgentDeskEngagementList
                  defaultEngagementId={defaultEngagementId}
                  engagements={engagements}
                />
              ) : (
                <div className="ui-card-panel px-5 py-8 text-center">
                  <p className="font-medium text-sm">No work here yet</p>
                  <p className="mt-1 text-muted-foreground text-sm">
                    Assign work to get started.
                  </p>
                </div>
              )}
            </DeskPageBody>
          )
        }
      </DeskFrame>
      {newRoomOpen ? (
        <AgentDeskNewRoomDialog
          host={{ engenty: agent.engenty, id: agent.id, name: agent.name }}
          onCreated={(createdThreadId) =>
            navigate(spaceRoomPathname(spaceKey, createdThreadId))
          }
          onOpenChange={setNewRoomOpen}
          open
          rosterAgents={props.rosterAgents ?? []}
          spaceId={spaceId}
        />
      ) : null}
    </>
  );
}
