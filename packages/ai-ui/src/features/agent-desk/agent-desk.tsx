import { spaceRoomPathname } from "@engenty/ai-core/browser";
import { useTranslation } from "@engenty/i18n/ui";
import { Engenty, uiPageScrollClassName } from "@engenty/ui-core";
import { type PageBreadcrumb, usePageConfig } from "@engenty/ui-plugin-sdk";
import { Lock } from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { WorkspaceArtifactPane } from "../../artifacts/workspace-artifact-pane.js";
import type { MentionRefSearch } from "../../components/copilot/composer/use-copilot-composer-mention.js";
import {
  clearPendingHostMessage,
  pendingHostMessageFromState,
  resolvePendingHostMessage,
  writePendingHostMessage,
} from "../../copilot/host-message-handoff.js";
import { spaceAgentDeskPath } from "../agent-form/hire-spaces.js";
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
  AgentDeskDrawer,
  type AgentDeskPanel,
  parseAgentDeskPanel,
} from "./agent-desk-drawer.js";
import { AgentDeskEngagementList } from "./agent-desk-engagement-list.js";
import { AgentDeskHeader } from "./agent-desk-header.js";
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
import { useAgentDeskFeed } from "./use-agent-desk-feed.js";

const NO_BREADCRUMBS: PageBreadcrumb[] = [];
const NO_ROSTER: readonly AgentDeskSwitchAgent[] = [];

/** Scroll depth that shrinks the identity header, and the one that restores it. */
const HEADER_COLLAPSE_AT_PX = 120;
const HEADER_EXPAND_AT_PX = 8;
/** Longer than the band's own 200ms height transition. */
const HEADER_SETTLE_MS = 260;

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
   * Who this agent reports to in this space, by name. Injected: `reports_to`
   * lives on the space's mount rows, which are the app's query.
   */
  reportsToName?: string;
  rosterAgents?: readonly AgentDeskSwitchAgent[];
  spaceId: string;
  spaceKey: string;
}) {
  const {
    agentId,
    canManageAgents,
    composerLeadingControl,
    mentionRefSearch,
    moduleLabel,
    reportsToName,
    rosterAgents = NO_ROSTER,
    spaceId,
    spaceKey,
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
  // Shrink the header to the title once the chat scrolls. Scroll events do
  // not bubble, so a capturing listener on the wrapper catches the chat's own
  // scroller.
  //
  // A callback ref, NOT useRef + useEffect([]): the first render of this page
  // early-returns a loading message, so an effect that reads the ref once finds
  // null and — with empty deps — never looks again. The listener would silently
  // never attach and the header would never collapse.
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const detachScroll = useRef<(() => void) | null>(null);
  const settleUntil = useRef(0);
  const scrollRootRef = useCallback((node: HTMLDivElement | null) => {
    detachScroll.current?.();
    detachScroll.current = null;
    if (!node) {
      return;
    }
    const onScroll = (event: Event) => {
      const el = event.target as HTMLElement | null;
      if (typeof el?.scrollTop !== "number") {
        return;
      }
      // Horizontal-only scrollers fire with scrollTop 0 and would wrongly
      // expand the header again.
      if (el.scrollHeight <= el.clientHeight) {
        return;
      }
      // Toggling the header resizes the transcript's viewport — over 200ms,
      // because the band animates — and every frame of that resize fires a
      // scroll event of its own. Read with one threshold and no settle window,
      // the header's own animation crossed that threshold back and the band
      // flickered between the two states near the top of the transcript.
      //
      // Three things keep the toggle from re-triggering itself: scroll
      // anchoring off, so a shrinking viewport does not drag scrollTop along;
      // a gap between the collapse and the expand point; and a settle window
      // that ignores the events the animation itself produces.
      if (performance.now() < settleUntil.current) {
        return;
      }
      el.style.overflowAnchor = "none";
      setHeaderCollapsed((collapsed) => {
        const next = collapsed
          ? el.scrollTop > HEADER_EXPAND_AT_PX
          : el.scrollTop > HEADER_COLLAPSE_AT_PX;
        if (next !== collapsed) {
          settleUntil.current = performance.now() + HEADER_SETTLE_MS;
        }
        return next;
      });
    };
    node.addEventListener("scroll", onScroll, true);
    detachScroll.current = () =>
      node.removeEventListener("scroll", onScroll, true);
  }, []);
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
  const breadcrumbs = useMemo((): PageBreadcrumb[] => {
    if (!feedQuery.data) {
      return NO_BREADCRUMBS;
    }
    const { agent: current } = feedQuery.data;
    return [
      {
        compactKept: true,
        label: (
          <AgentDeskSwitcher
            agents={rosterAgents}
            current={{ id: current.id, kind: "agent" }}
            label={
              <Link
                className="flex min-w-0 items-center gap-1.5 rounded-sm font-medium text-foreground text-sm hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                to={spaceAgentDeskPath(spaceKey, current.id)}
              >
                <Engenty kind={current.engenty} size={20} />
                <span className="min-w-0 truncate">{current.name}</span>
              </Link>
            }
            rooms={switchRoomsFrom(
              conversationsQuery.data?.rooms ?? [],
              rosterAgents
            )}
            spaceKey={spaceKey}
          />
        ),
        menuLabel: current.name,
      },
    ];
  }, [conversationsQuery.data?.rooms, feedQuery.data, rosterAgents, spaceKey]);

  usePageConfig({
    actions,
    breadcrumbs,
    contentStackBackground: "paper",
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
  const openEngagementIsDm = openEngagement?.metadata.dm === true;
  const defaultEngagementId =
    deskDefault?.kind === "desk" ? deskDefault.engagement?.id : undefined;
  // Non-chat agents never had a chat to show; their Chat position falls back to
  // the engagement list they always had.
  const chatIsConversation =
    asking || Boolean(threadId) || isAgentDeskChatSurface(agent);

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
      mentionRefSearch={mentionRefSearch}
      onPendingConsumed={consumePendingSubmit}
      onThreadCreated={(createdThreadId) => {
        if (resolvePendingHostMessage(hostKey, location.state)) {
          deferredCreatedThreadId.current = createdThreadId;
          return;
        }
        bindCreatedThread(createdThreadId, false);
      }}
      pendingSubmit={pendingSubmit}
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
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      {/* The agent's identity is the page header — not a block inside the chat
          that only the empty state showed. */}
      <AgentDeskHeader
        agent={agent}
        collapsed={headerCollapsed}
        moduleLabel={moduleLabel}
        reportsToName={reportsToName}
      />
      {threadId && chatSurface && openEngagementIsDm ? (
        <div
          className="flex items-center gap-2 border-border-soft border-b px-4 py-2 text-muted-foreground text-sm"
          data-testid="agent-desk-dm-bar"
        >
          <Lock aria-hidden className="size-3.5 shrink-0" />
          <span className="min-w-0 truncate">
            {t("agentDesk.dm.onlyYou", { name: agent.name })}
          </span>
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col" ref={scrollRootRef}>
        {chatBody}
      </div>
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
      <AgentDeskDrawer
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
