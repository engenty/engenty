import { spaceRoomPathname } from "@engenty/ai-core/browser";
import { useTranslation } from "@engenty/i18n/ui";
import { Engenty, uiPageScrollClassName } from "@engenty/ui-core";
import { type PageBreadcrumb, usePageConfig } from "@engenty/ui-plugin-sdk";
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
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
import { WorkspaceArtifactPane } from "../../artifacts/workspace-artifact-pane.js";
import {
  type ChatKind,
  useChatKindCopy,
} from "../../components/copilot/chat-kind-badge.js";
import type { MentionRefSearch } from "../../components/copilot/composer/use-copilot-composer-mention.js";
import { ThreadContextPane } from "../../components/copilot/thread-context/thread-context-pane.js";
import {
  THREAD_CONTEXT_FLOAT_GAP_PX,
  THREAD_CONTEXT_TOP_CLEARANCE_VAR,
} from "../../components/copilot/thread-context/thread-context-types.js";
import {
  clearPendingHostMessage,
  pendingHostMessageFromState,
  resolvePendingHostMessage,
  writePendingHostMessage,
} from "../../copilot/host-message-handoff.js";
import { ObjectDisplayIntentProvider } from "../../objects/object-display-intent.js";
import { UserBrowserPane } from "../browser/user-browser-pane.js";
import { AgentDeskActions } from "./agent-desk-actions.js";
import { AgentDeskChat } from "./agent-desk-chat.js";
import {
  canManageAgent,
  isAgentDeskChatSurface,
  resolveAgentDeskDefault,
} from "./agent-desk-defaults.js";
import {
  AGENT_DESK_PANEL_STATE_KEYS,
  type AgentDeskPanel,
  parseAgentDeskPanel,
} from "./agent-desk-drawer.js";
import { AgentDeskEngagementList } from "./agent-desk-engagement-list.js";
import {
  AgentDeskHeader,
  type AgentDeskReaders,
  type AgentDeskRelation,
} from "./agent-desk-header.js";
import { AgentDeskNewRoomDialog } from "./agent-desk-new-room-dialog.js";
import { AgentDeskPane } from "./agent-desk-pane.js";
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
import { useAgentDeskFeed } from "./use-agent-desk-feed.js";
import { useDeskObjectDisplayIntent } from "./use-desk-object-display-intent.js";

const NO_BREADCRUMBS: PageBreadcrumb[] = [];
const NO_ROSTER: readonly AgentDeskSwitchAgent[] = [];

/** The engagement list of an agent that has no chat, as a scrolling column. */
function PageBody({ children }: { children: ReactNode }) {
  return (
    <div className={uiPageScrollClassName}>
      <div className="mx-auto w-full max-w-5xl px-page py-6">{children}</div>
    </div>
  );
}

function DeskMessage({
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
  const selected = searchParams.get("engagement");
  const threadId = threadIdFromEngagement(selected);
  const asking = searchParams.get("action") === "ask";
  // The drawer over the chat, if one is open. `tab` is the key links minted
  // before the drawer carry; it resolves the same way.
  const panel = parseAgentDeskPanel(
    searchParams.get("panel") ?? searchParams.get("tab")
  );
  const openPanel = useCallback(
    (next: AgentDeskPanel) => {
      setSearchParams((current) => {
        const params = new URLSearchParams(current);
        params.set("panel", next);
        params.delete("tab");
        return params;
      });
    },
    [setSearchParams]
  );
  const closePanel = useCallback(() => {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      params.delete("panel");
      params.delete("tab");
      for (const key of AGENT_DESK_PANEL_STATE_KEYS) {
        params.delete(key);
      }
      return params;
    });
  }, [setSearchParams]);
  const objectDisplayIntent = useDeskObjectDisplayIntent(hostKey);
  const deskDefault = feedQuery.data
    ? resolveAgentDeskDefault(feedQuery.data)
    : null;
  const newestConversation =
    deskDefault?.kind === "conversation" ? deskDefault.engagement : null;
  const chatSurface = Boolean(
    feedQuery.data && isAgentDeskChatSurface(feedQuery.data.agent)
  );
  const shouldBindLatestConversation =
    chatSurface && !(selected || asking) && Boolean(newestConversation);
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
  // Compact overlay in the topbar band once the identity has scrolled. The
  // large identity stays in the transcript — swapping its height used to
  // oscillate the scroller at one content length.
  const [headerCollapsed, setHeaderCollapsed] = useState(() =>
    Boolean(threadId)
  );
  const onTranscriptTopVisibility = useCallback((visible: boolean) => {
    setHeaderCollapsed(!visible);
  }, []);
  useEffect(() => {
    setHeaderCollapsed(Boolean(threadId));
  }, [threadId]);
  // The band is opaque and sits over the top of the chat, so the floating
  // context card has to clear it, not just the topbar. Its height depends on
  // how the badges wrap, so it is measured rather than guessed.
  const bandObserver = useRef<ResizeObserver | null>(null);
  const [bandHeightPx, setBandHeightPx] = useState(0);
  const bandRef = useCallback((node: HTMLDivElement | null) => {
    bandObserver.current?.disconnect();
    bandObserver.current = null;
    if (!node) {
      setBandHeightPx(0);
      return;
    }
    setBandHeightPx(node.offsetHeight);
    const observer = new ResizeObserver(() => {
      setBandHeightPx(node.offsetHeight);
    });
    observer.observe(node);
    bandObserver.current = observer;
  }, []);
  useEffect(() => () => bandObserver.current?.disconnect(), []);
  const actions = feedQuery.data ? (
    <AgentDeskActions
      agentId={feedQuery.data.agent.id}
      agentName={feedQuery.data.agent.name}
      canAsk={feedQuery.data.agent.can_ask}
      canAssignWork={feedQuery.data.agent.can_assign_work}
      canManage={canManage}
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
  const kindCopy = useChatKindCopy({
    kind: chatKind ?? "desk",
    name: feedQuery.data?.agent.name,
    spaceName,
  });
  // The composer says who reads before the first word is typed.
  const composerPlaceholder = feedQuery.data
    ? `${t("agentDesk.composerPlaceholder", { name: feedQuery.data.agent.name })} · ${kindCopy.readers}`
    : undefined;
  const breadcrumbs = useMemo((): PageBreadcrumb[] => {
    if (!feedQuery.data) {
      return NO_BREADCRUMBS;
    }
    const { agent: current } = feedQuery.data;
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
            <Engenty kind={current.engenty} size={20} />
            <span className="min-w-0 truncate">{current.name}</span>
          </button>
        ),
        menuLabel: current.name,
      },
    ];
  }, [feedQuery.data, openPanel]);
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
          spaceKey={spaceKey}
        />
      ) : null,
    [conversationsQuery.data?.rooms, feedQuery.data, rosterAgents, spaceKey]
  );

  usePageConfig({
    actions,
    breadcrumbs,
    contentStackBackground: "paper",
    routeBreadcrumbAction,
    // The header is a white band, so the transparent topbar floats over it
    // and the two blend — as on the admin personnel file. The header's own top
    // clearance keeps the title clear of the topbar's controls.
    topbarOverlap: true,
  });

  useEffect(() => {
    if (!(shouldBindLatestConversation && newestConversation)) {
      return;
    }
    const next = new URLSearchParams(searchParams);
    next.set("engagement", newestConversation.id);
    setSearchParams(next, { replace: true });
  }, [
    newestConversation,
    searchParams,
    setSearchParams,
    shouldBindLatestConversation,
  ]);

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
  // Who reads the open conversation — part of the identity block, in its
  // column, so it lines up with the mandate rather than with the avatar.
  const readers: AgentDeskReaders | null =
    threadId && chatSurface && chatKind
      ? chatKind === "dm"
        ? { kind: "dm", text: t("agentDesk.dm.onlyYou", { name: agent.name }) }
        : { kind: "shared", text: kindCopy.readers }
      : null;
  const scrollHeader = (
    <AgentDeskHeader
      agent={agent}
      chatKind={chatKind}
      collapsed={false}
      hostKey={hostKey}
      moduleLabel={moduleLabel}
      readers={readers}
      relation={relation}
      spaceName={spaceName}
    />
  );
  // Non-chat agents never had a chat to show; their Chat position falls back to
  // the engagement list they always had.
  const chatBody = chatIsConversation ? (
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
    <PageBody>
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
    </PageBody>
  );

  return (
    <div
      className="relative flex h-full min-h-0 w-full flex-col overflow-hidden"
      style={
        {
          [THREAD_CONTEXT_TOP_CLEARANCE_VAR]: bandHeightPx
            ? `${bandHeightPx + THREAD_CONTEXT_FLOAT_GAP_PX}px`
            : undefined,
        } as CSSProperties
      }
    >
      {chatIsConversation && headerCollapsed ? (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-10"
          ref={bandRef}
        >
          <AgentDeskHeader
            agent={agent}
            chatKind={chatKind}
            collapsed
            hostKey={hostKey}
            moduleLabel={moduleLabel}
            readers={readers}
            relation={relation}
            spaceName={spaceName}
          />
        </div>
      ) : null}
      {/* Identity scrolls with the transcript; the context card is overlaid
          (sticky in the pane) so the main column is one scroller. */}
      <ObjectDisplayIntentProvider value={objectDisplayIntent}>
        <ThreadContextPane
          {...(chatIsConversation ? {} : { header: scrollHeader })}
          hostKey={hostKey}
          layout="column"
        >
          {chatBody}
        </ThreadContextPane>
      </ObjectDisplayIntentProvider>
      {/* The person's browser in the end-pane slot beside the artifact pane,
          whatever the desk shows — conversation or engagement list — so the
          monitor toggle always has somewhere to open (PLAN-user-browser.md
          §2.6). */}
      <UserBrowserPane spaceId={spaceId} />
      {/* Scoped to the open conversation, not the copilot's thread: the desk
          shows what THIS agent produced here, and the same subscription lets
          the agent bring an artefact it is working on to the front. */}
      <WorkspaceArtifactPane
        extraScope={{ id: agent.id, type: "agent" }}
        hostKey={hostKey}
        scope={{ id: threadId, type: "thread" }}
      />
      <AgentDeskPane
        agent={agent}
        canEditPads={Boolean(feedQuery.data && canManageAgents)}
        canManage={canManage}
        locale={locale}
        moduleLabel={moduleLabel}
        onClose={closePanel}
        panel={panel}
        spaceId={spaceId}
      />
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
    </div>
  );
}
