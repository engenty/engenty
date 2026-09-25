// The frame every desk shares — the copilot's river as much as a specialist's
// desk in a space: the topbar's crumbs and actions, the identity band that
// comes up once the identity block has scrolled away, the context card as a
// column beside the chat, and the end panes (the person's browser, the
// artefacts, the settings / runs pane). What differs between the two is
// which thread the lane binds and what the actions offer; that is the
// caller's, handed in as the lane (`children`) and the `actions`.
//
// The band and the identity block are one component in two states
// (`AgentDeskHeader`). The block scrolls with the transcript; the band is an
// opaque overlay in the topbar row while the block is out of view — swapping
// the block's height used to oscillate the scroller at one content length.
import { uiPageScrollClassName } from "@engenty/ui-core";
import { type PageBreadcrumb, usePageConfig } from "@engenty/ui-plugin-sdk";
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { WorkspaceArtifactPane } from "../../artifacts/workspace-artifact-pane.js";
import type {
  ChatSpaceAudience,
  ChatVisibility,
} from "../../components/copilot/chat-visibility.js";
import { ThreadContextPane } from "../../components/copilot/thread-context/thread-context-pane.js";
import {
  THREAD_CONTEXT_FLOAT_GAP_PX,
  THREAD_CONTEXT_TOP_CLEARANCE_VAR,
} from "../../components/copilot/thread-context/thread-context-types.js";
import {
  type ObjectDisplayIntent,
  ObjectDisplayIntentProvider,
} from "../../objects/object-display-intent.js";
import {
  type BrowserTarget,
  BrowserTargetProvider,
} from "../browser/browser-target.js";
import { UserBrowserPane } from "../browser/user-browser-pane.js";
import type { AgentDeskPanel } from "./agent-desk-drawer.js";
import {
  AgentDeskHeader,
  type AgentDeskHeaderProps,
} from "./agent-desk-header.js";
import { AgentDeskPane } from "./agent-desk-pane.js";

/** The engagement list of an agent that has no chat, as a scrolling column. */
export function DeskPageBody({ children }: { children: ReactNode }) {
  return (
    <div className={uiPageScrollClassName}>
      <div className="mx-auto w-full max-w-5xl px-page py-6">{children}</div>
    </div>
  );
}

export function DeskMessage({
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

export interface DeskFrameLane {
  /** The top of the transcript scrolled out of, or back into, view. */
  onTranscriptTopVisibility: (visible: boolean) => void;
  /** The identity block, to be the transcript's first row. */
  scrollHeader: ReactNode;
}

export interface DeskFrameProps {
  actions: ReactNode;
  /**
   * The page fill behind the chat. The Copilot's full chat takes the card
   * fill its sidebar and window have, so it reads the same in every mode;
   * desks default to paper.
   */
  background?: "paper" | "card";
  breadcrumbs: PageBreadcrumb[];
  /**
   * The browser the monitor pane shows: this desk's agent's window in its
   * Space's browser (the copilot's: the personal Space's).
   */
  browserTarget: BrowserTarget;
  canEditPads: boolean;
  canManage: boolean;
  /** One chapter opened over the transcript (thread-chapters.tsx), if any. */
  chapterCard?: ReactNode;
  /** False when the desk shows an engagement list rather than a conversation. */
  chatIsConversation: boolean;
  /** The lane, given the identity block and the scroll sentinel's callback. */
  children: (lane: DeskFrameLane) => ReactNode;
  header: Omit<AgentDeskHeaderProps, "collapsed">;
  hostKey: string;
  locale: string;
  objectDisplayIntent: ObjectDisplayIntent;
  onClosePanel: () => void;
  panel: AgentDeskPanel | null;
  routeBreadcrumbAction?: ReactNode;
  secondaryNavAfterItems?: ReactNode;
  secondaryNavHeaderSlot?: ReactNode;
  spaceAudience?: ChatSpaceAudience | null;
  /** Null on the copilot's desk outside a space. */
  spaceId: string | null;
  threadId: string | null;
  visibility: ChatVisibility | null;
}

export function DeskFrame(props: DeskFrameProps) {
  const { chatIsConversation, header, threadId, visibility } = props;
  // Compact overlay in the topbar band once the identity has scrolled. The
  // large identity stays in the transcript — swapping its height used to
  // oscillate the scroller at one content length.
  const [headerCollapsed, setHeaderCollapsed] = useState(() =>
    Boolean(threadId)
  );
  const onTranscriptTopVisibility = useCallback((visible: boolean) => {
    setHeaderCollapsed(!visible);
  }, []);
  // A layout effect on purpose: the chat panel reports an empty transcript
  // (identity in view, no band) in a plain effect, which runs after this —
  // so on a switch to an empty thread its word is the last one.
  useLayoutEffect(() => {
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

  usePageConfig({
    actions: props.actions,
    breadcrumbs: props.breadcrumbs,
    contentStackBackground: props.background ?? "paper",
    ...(props.routeBreadcrumbAction === undefined
      ? {}
      : { routeBreadcrumbAction: props.routeBreadcrumbAction }),
    ...(props.secondaryNavAfterItems === undefined
      ? {}
      : { secondaryNavAfterItems: props.secondaryNavAfterItems }),
    ...(props.secondaryNavHeaderSlot === undefined
      ? {}
      : { secondaryNavHeaderSlot: props.secondaryNavHeaderSlot }),
    // The header is a white band, so the transparent topbar floats over it
    // and the two blend — as on the admin personnel file. The header's own top
    // clearance keeps the title clear of the topbar's controls.
    topbarOverlap: true,
    // A private chat's band is the other theme; the crumbs and actions
    // floating over it flip with it, and only while the band is up.
    topbarTone:
      chatIsConversation && headerCollapsed && visibility === "private"
        ? "flip"
        : "default",
  });

  const scrollHeader = <AgentDeskHeader {...header} collapsed={false} />;
  const lane = props.children({ onTranscriptTopVisibility, scrollHeader });

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
        // Above the transcript's own top fade (z-10, a later sibling that
        // would otherwise wash over the band's top edge), under the topbar
        // (z-20).
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-[15]"
          ref={bandRef}
        >
          <AgentDeskHeader {...header} collapsed />
        </div>
      ) : null}
      {/* Identity scrolls with the transcript; the context card is overlaid
          (sticky in the pane) so the main column is one scroller. */}
      <ObjectDisplayIntentProvider value={props.objectDisplayIntent}>
        <ThreadContextPane
          {...(chatIsConversation ? {} : { header: scrollHeader })}
          hostKey={props.hostKey}
          layout="column"
          // The host's skills and memory say nothing about a thread between
          // two agents.
          showContext={!header.pairTitle}
        >
          {props.chapterCard}
          {lane}
        </ThreadContextPane>
      </ObjectDisplayIntentProvider>
      {/* The agent's browser window in the end-pane slot beside the artifact pane,
          whatever the desk shows — conversation or engagement list — so the
          monitor toggle always has somewhere to open (PLAN-user-browser.md
          §2.6). */}
      <BrowserTargetProvider value={props.browserTarget}>
        <UserBrowserPane />
      </BrowserTargetProvider>
      {/* Scoped to the open conversation: the desk shows what THIS agent
          produced here, and the same subscription lets the agent bring an
          artefact it is working on to the front. */}
      <WorkspaceArtifactPane
        extraScope={{ id: header.agent.id, type: "agent" }}
        hostKey={props.hostKey}
        scope={{ id: threadId, type: "thread" }}
      />
      <AgentDeskPane
        agent={header.agent}
        canEditPads={props.canEditPads}
        canManage={props.canManage}
        hostKey={props.hostKey}
        locale={props.locale}
        moduleLabel={header.moduleLabel}
        onClose={props.onClosePanel}
        panel={props.panel}
        spaceId={props.spaceId}
      />
    </div>
  );
}
