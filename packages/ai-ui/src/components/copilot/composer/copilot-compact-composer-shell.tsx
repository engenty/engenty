"use client";

import type { AgentTurnMessageLike } from "@engenty/ag-ui-bridge";
import {
  BLOB_CHARACTER_COLORS,
  BlobAvatar,
  type BlobCharacter,
  cn,
  ENGENTY_FILL,
  ENGENTY_KIND_FILL,
  Engenty,
  type EngentyKind,
  resolveBlobCharacter,
  useBlobCharacterCycle,
} from "@engenty/ui-core";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import {
  buildAssistantActivitySignature,
  getLastAssistantMessage,
} from "./agent-status-ticker/derive-agent-status-ticker.js";
import type {
  AgentRunStatus,
  AgentStatusTickerLabels,
} from "./agent-status-ticker/types.js";
import {
  CopilotComposerStatusFlap,
  getAssistantReplyText,
  getLastUserMessageText,
  useAnimatedPresence,
} from "./copilot-composer-status-flap.js";
import { CopilotComposerUsageMeter } from "./copilot-composer-usage-meter.js";

const POST_RUN_TICKER_MS = 1800;
/** Collapsed flap max height — two `text-sm` lines plus `py-2`. */
const STATUS_FLAP_COLLAPSED_MAX_HEIGHT = "3.5rem";
/** How far the rear status layer overlaps behind the front composer card. */
const STATUS_FLAP_OVERLAP = "1.25rem";
/** Space reserved above the card so the overlapped flap stays inside this shell's box. */
const STATUS_FLAP_LAYOUT_CLEARANCE = `calc(${STATUS_FLAP_COLLAPSED_MAX_HEIGHT} - ${STATUS_FLAP_OVERLAP})`;

/**
 * Controls the visual surface (background, border, shadow) of the card.
 *
 * - `"default"` — floating launcher style: transparent bg, border, shadow.
 * - `"dock"` — bottom-dock style: semi-transparent bg with backdrop-blur and
 *   a slightly elevated shadow. Use for the bottom bar in the drawer.
 * - `"dock-tinted"` — same as `"dock"` but with the blob accent tint
 *   (`blob-tinted-card`), used in the main-panel bottom dock.
 */
export type CopilotCompactComposerShellVariant =
  | "default"
  | "dock"
  | "dock-tinted";

export interface CopilotCompactComposerShellProps {
  /** When false, the status flap will not auto-expand after a run. Defaults to
   *  true. Pass false when the reply is already visible in an attached thread. */
  autoExpand?: boolean;
  /** Rendered under the card, left of the usage meter (e.g. context chooser). */
  belowCard?: ReactNode;
  cardChrome?: ReactNode;
  /** When set, the peeking blob uses this character instead of cycling. */
  character?: BlobCharacter;
  chatStatus: "ready" | "streaming" | "submitted" | "error";
  children: ReactNode;
  className?: string;
  /** Persisted expanded status-flap body height (px). */
  compactStatusFlapHeight?: number;
  /** Tighter padding for a composer inside a card rather than the dock. */
  dense?: boolean;
  /** Docked surfaces (message queue, approval / decision cards) rendered as a
   *  flap directly attached behind the composer card — card background, no gap.
   *  While set, the status flap is suppressed and the blob avatar rides this
   *  flap's top edge instead of overlapping its content. */
  dockContent?: ReactNode;
  enableStatusFlap?: boolean;
  /** Specialist desks: styleguide engenty instead of the cycling BlobAvatar. */
  engentyKind?: EngentyKind;
  errorMessage?: string | null;
  /** Force the active state (avatar + belowCard always visible). Use on the
   *  copilot start screen so the context chooser is always shown. */
  forceActive?: boolean;
  /** Pending HITL interrupt UI (approval / decision / feedback card). While
   *  set, the status flap is forced visible and renders it interactively. */
  interruptContent?: ReactNode;
  /** Whether the textarea has wrapped to multiple lines. Controls the
   *  card's rounding and padding (capsule ↔ rounded rectangle). */
  isMultiline?: boolean;
  labels?: AgentStatusTickerLabels;
  messages?: readonly AgentTurnMessageLike[];
  onCompactStatusFlapHeightChange?: (height: number) => void;
  /** Optimistic user text while a run is in flight (not yet in `messages`) —
   *  shown as the flap's one-line "sending" preview with the spinner. */
  pendingUserText?: string | null;
  runStatus?: AgentRunStatus | null;
  showAvatar?: boolean;
  showUsageMeter?: boolean;
  stale?: boolean;
  threadId?: string | null;
  /**
   * Visual-surface variant of the card. Defaults to `"default"`.
   * @see CopilotCompactComposerShellVariant
   */
  variant?: CopilotCompactComposerShellVariant;
}

function useShowCompactAgentTicker({
  chatStatus,
  runStatus,
}: {
  chatStatus: CopilotCompactComposerShellProps["chatStatus"];
  runStatus: AgentRunStatus | null | undefined;
}) {
  const [showPostRunTicker, setShowPostRunTicker] = useState(false);
  const postRunTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevStatusRef = useRef(chatStatus);

  useEffect(() => {
    if (
      chatStatus === "submitted" ||
      chatStatus === "streaming" ||
      chatStatus === "error"
    ) {
      if (postRunTimeoutRef.current) {
        clearTimeout(postRunTimeoutRef.current);
        postRunTimeoutRef.current = null;
      }
      setShowPostRunTicker(false);
    }
  }, [chatStatus]);

  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = chatStatus;
    if (
      prev !== "ready" &&
      chatStatus === "ready" &&
      (prev === "submitted" || prev === "streaming" || prev === "error")
    ) {
      if (postRunTimeoutRef.current) {
        clearTimeout(postRunTimeoutRef.current);
      }
      setShowPostRunTicker(true);
      postRunTimeoutRef.current = setTimeout(() => {
        setShowPostRunTicker(false);
        postRunTimeoutRef.current = null;
      }, POST_RUN_TICKER_MS);
    }
    return () => {
      if (postRunTimeoutRef.current) {
        clearTimeout(postRunTimeoutRef.current);
      }
    };
  }, [chatStatus]);

  const showRunningTicker =
    chatStatus === "submitted" ||
    chatStatus === "streaming" ||
    chatStatus === "error" ||
    runStatus === "queued" ||
    runStatus === "running" ||
    runStatus === "waiting_for_input" ||
    runStatus === "waiting_for_approval" ||
    runStatus === "failed" ||
    runStatus === "timed_out";

  return showRunningTicker || showPostRunTicker;
}

function useRunActivityBaseline(
  chatStatus: CopilotCompactComposerShellProps["chatStatus"],
  messages: readonly AgentTurnMessageLike[]
) {
  const prevStatusRef = useRef(chatStatus);
  const baselineRef = useRef<string | null>(null);

  const prevStatus = prevStatusRef.current;
  if (
    (chatStatus === "submitted" ||
      chatStatus === "streaming" ||
      chatStatus === "error") &&
    prevStatus === "ready"
  ) {
    baselineRef.current = buildAssistantActivitySignature(messages);
  } else if (
    chatStatus === "ready" &&
    (prevStatus === "submitted" ||
      prevStatus === "streaming" ||
      prevStatus === "error")
  ) {
    baselineRef.current = null;
  }
  prevStatusRef.current = chatStatus;

  const currentSignature = buildAssistantActivitySignature(messages);
  const hasNewActivity =
    baselineRef.current == null || currentSignature !== baselineRef.current;

  return {
    activityBaselineSignature: baselineRef.current,
    hasNewActivity,
  };
}

function shouldShowRunningStatusFlap(input: {
  chatStatus: CopilotCompactComposerShellProps["chatStatus"];
  hasNewActivity: boolean;
  messages: readonly AgentTurnMessageLike[];
}) {
  const isActiveRun =
    input.chatStatus === "submitted" ||
    input.chatStatus === "streaming" ||
    input.chatStatus === "error";
  if (!isActiveRun) {
    return false;
  }
  if (input.chatStatus === "error") {
    return true;
  }
  if (!getLastAssistantMessage(input.messages)) {
    return true;
  }
  return input.hasNewActivity;
}

/** Maps a variant name to its static card surface classes (no rounding/padding). */
const cardVariantClasses: Record<CopilotCompactComposerShellVariant, string> = {
  default:
    "border bg-card shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/95 supports-[backdrop-filter]:backdrop-blur",
  dock: "border bg-card/95 shadow-lg supports-[backdrop-filter]:bg-card/85 supports-[backdrop-filter]:backdrop-blur",
  "dock-tinted":
    "border bg-card/95 shadow-lg supports-[backdrop-filter]:bg-card/85 supports-[backdrop-filter]:backdrop-blur blob-tinted-card",
};

/** Keep expanded chrome when focus moves to below-card controls or portaled menus. */
function isComposerChromeFocusTarget(
  shellRoot: HTMLElement | null,
  target: EventTarget | null
): boolean {
  if (!(target instanceof Node)) {
    return false;
  }
  if (shellRoot?.contains(target)) {
    return true;
  }
  if (target instanceof Element) {
    return Boolean(
      target.closest(
        [
          '[data-slot="select-content"]',
          '[data-slot="dropdown-menu-content"]',
          '[data-slot="popover-content"]',
        ].join(",")
      )
    );
  }
  return false;
}

export function CopilotCompactComposerShell({
  autoExpand = true,
  belowCard,
  cardChrome,
  character,
  chatStatus,
  children,
  className,
  compactStatusFlapHeight,
  dense = false,
  dockContent = null,
  enableStatusFlap = true,
  engentyKind,
  errorMessage = null,
  forceActive = false,
  interruptContent = null,
  labels,
  messages = [],
  onCompactStatusFlapHeightChange,
  pendingUserText = null,
  runStatus = null,
  showUsageMeter = true,
  stale = false,
  threadId = null,
  isMultiline = false,
  showAvatar = true,
  variant = "default",
}: CopilotCompactComposerShellProps) {
  const tickerVisible = useShowCompactAgentTicker({ chatStatus, runStatus });
  const { activityBaselineSignature, hasNewActivity } = useRunActivityBaseline(
    chatStatus,
    messages
  );
  // The one-line "sending" preview: the message the user just submitted,
  // shown with the ticker spinner while the run has produced nothing yet.
  const isActiveRun = chatStatus === "submitted" || chatStatus === "streaming";
  const sendingUserText = isActiveRun
    ? pendingUserText?.trim() || getLastUserMessageText(messages)
    : "";
  const showRunningFlap =
    enableStatusFlap &&
    (shouldShowRunningStatusFlap({
      chatStatus,
      hasNewActivity,
      messages,
    }) ||
      // Without this, submitting into a thread that already has an assistant
      // reply shows NO flap until new activity streams — the user stares at a
      // bare composer wondering whether the send registered.
      (isActiveRun && sendingUserText.length > 0));
  // Only persist the flap for runs that happened while this shell was mounted.
  const hadRunRef = useRef(false);
  if (chatStatus === "submitted" || chatStatus === "streaming") {
    hadRunRef.current = true;
  }
  const replyText = getAssistantReplyText(messages);
  // Content reply -> the flap stays after the run (expandable). Command-only
  // run (tool calls, no text) -> show the post-run ticker briefly, then leave.
  const showPostRunFlap =
    enableStatusFlap &&
    chatStatus === "ready" &&
    hadRunRef.current &&
    (replyText.length > 0 || tickerVisible);
  // Persistent history hint: whenever the thread already has a real
  // back-and-forth (at least one user message) and a reply exists, keep the
  // flap showing a 1-line preview — so reopening the launcher/dock on an
  // existing conversation shows continuity, not a blank composer.
  const hasConversation = messages.some((message) => message.role === "user");
  const idlePreviewText =
    enableStatusFlap && chatStatus === "ready" && hasConversation
      ? replyText
      : "";
  const hasDockContent = dockContent != null;
  const showStatus =
    !hasDockContent &&
    ((enableStatusFlap && interruptContent != null) ||
      showRunningFlap ||
      showPostRunFlap ||
      idlePreviewText.length > 0);
  const { closing, rendered } = useAnimatedPresence(showStatus);

  const [isFocused, setIsFocused] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [hasContent, setHasContent] = useState(false);
  const cycledCharacter = useBlobCharacterCycle();
  const blobCharacter = resolveBlobCharacter(character ?? cycledCharacter);
  const cardRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const textarea = cardRef.current?.querySelector("textarea");
    if (textarea) {
      setHasContent(textarea.value.trim().length > 0);
    }
  }, []);

  const active =
    forceActive ||
    isFocused ||
    hasContent ||
    chatStatus === "submitted" ||
    chatStatus === "streaming";
  const shouldShowAvatar = active || isHovered;
  // If forceActive, skip the "has interacted" gate so the avatar shows immediately.
  const [hasInteracted, setHasInteracted] = useState(forceActive);

  useEffect(() => {
    if (shouldShowAvatar) {
      setHasInteracted(true);
    }
  }, [shouldShowAvatar]);

  // Peeking blob avatar + drop shadow. Anchored to whichever surface is the
  // visual top: rendered INSIDE the flap while it is open (so the avatar sits
  // on the flap's top edge instead of overlapping its content/buttons), and
  // directly above the composer card otherwise.
  const avatarOverlay =
    showAvatar && hasInteracted ? (
      <>
        {/* Shadow FIRST in DOM → paints behind the avatar (z-[15] < avatar z-20). */}
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute -top-1 right-10 z-[15] h-3 w-16",
            shouldShowAvatar ? "shadow-enter-active" : "shadow-leave-active"
          )}
        >
          <span className="absolute left-3 h-3 w-4/5 rounded-full bg-foreground/35 blur-[8px]" />
        </span>
        {/* Avatar SECOND in DOM → paints on top of the shadow. */}
        <div
          className={cn(
            "avatar-animated-wrap",
            shouldShowAvatar ? "avatar-enter-active" : "avatar-leave-active"
          )}
        >
          {engentyKind ? (
            <Engenty
              className="[&_.e-shadow]:hidden"
              kind={engentyKind}
              size={48}
            />
          ) : (
            <BlobAvatar
              character={blobCharacter}
              state={
                chatStatus === "submitted"
                  ? "thinking"
                  : chatStatus === "streaming"
                    ? "streaming"
                    : "idle"
              }
            />
          )}
        </div>
      </>
    ) : null;

  return (
    <div
      className={cn(
        // Always visible so the peeking blob can sit above the flap/card.
        "relative overflow-visible motion-safe:transition-[padding-top] motion-safe:duration-300 motion-safe:ease-out",
        className
      )}
      onBlur={(e) => {
        if (!isComposerChromeFocusTarget(shellRef.current, e.relatedTarget)) {
          setIsFocused(false);
        }
      }}
      onFocus={() => setIsFocused(true)}
      ref={shellRef}
      style={
        {
          paddingTop: rendered ? STATUS_FLAP_LAYOUT_CLEARANCE : 0,
          "--blob-accent": engentyKind
            ? ENGENTY_FILL[ENGENTY_KIND_FILL[engentyKind]]
            : BLOB_CHARACTER_COLORS[
                blobCharacter % BLOB_CHARACTER_COLORS.length
              ],
        } as CSSProperties
      }
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .blob-tinted-card {
              transition: border-color 300ms ease-out, box-shadow 300ms ease-out;
              border-radius: 1.7rem;
              padding: 0.7rem 1rem;
            }
            .blob-tinted-card:focus-within {
              border-color: color-mix(in oklch, var(--blob-accent, var(--ember)) 60%, transparent);
              box-shadow: 0 10px 28px -10px color-mix(in oklch, var(--blob-accent, var(--ember)) 50%, transparent);
            }
            @keyframes avatar-appear-jump {
              0% {
                opacity: 0;
                transform: translateY(24px) scale(0.5);
                z-index: 0;
              }
              30% {
                opacity: 1;
                transform: translateY(12px) scale(0.8);
                z-index: 0;
              }
              60% {
                transform: translateY(-20px) scale(1.15);
                z-index: 20;
              }
              85% {
                transform: translateY(8px) scale(1.05, 0.95);
                z-index: 20;
              }
              100% {
                opacity: 1;
                transform: translateY(6px) scale(1);
                z-index: 20;
              }
            }
            @keyframes avatar-exit {
              0% {
                opacity: 1;
                transform: translateY(6px) scale(1);
                z-index: 20;
              }
              100% {
                opacity: 0;
                transform: translateY(24px) scale(0.5);
                z-index: 0;
              }
            }
            @keyframes shadow-appear {
              0% {
                opacity: 0;
                transform: scale(0.3) translateY(0);
              }
              30% {
                opacity: 0.2;
                transform: scale(0.5) translateY(1px);
              }
              60% {
                opacity: 0.15;
                transform: scale(0.45) translateY(2px);
              }
              85% {
                opacity: 0.8;
                transform: scale(0.9) translateY(0.5px);
              }
              100% {
                opacity: 1;
                transform: scale(1) translateY(0);
              }
            }
            @keyframes shadow-exit {
              0% {
                opacity: 1;
                transform: scale(1) translateY(0);
              }
              100% {
                opacity: 0;
                transform: scale(0.3) translateY(0);
              }
            }
            .avatar-animated-wrap {
              position: absolute;
              right: 40px; /* right-10 is 40px */
              bottom: 100%;
              pointer-events: none;
              user-select: none;
            }
            .avatar-animated-wrap .blob-shadow {
              display: none !important;
            }
            .avatar-enter-active {
              animation: avatar-appear-jump 0.65s cubic-bezier(0.25, 0.8, 0.25, 1.25) forwards;
            }
            .avatar-leave-active {
              animation: avatar-exit 0.3s ease-in forwards;
            }
            .shadow-enter-active {
              animation: shadow-appear 0.65s ease-out forwards;
            }
            .shadow-leave-active {
              animation: shadow-exit 0.3s ease-in forwards;
            }
          `,
        }}
      />
      <div className="relative">
        {hasDockContent ? (
          // In-flow flap tucked directly behind the composer card: same card
          // background, rounded top, and the card (z-10) overlaps its bottom
          // edge so the two read as one attached surface — no gap. In-flow
          // (not absolute) so variable-height content (queue rows, approval
          // cards) pushes the transcript up instead of covering it.
          <div className="relative -mb-5 overflow-visible rounded-t-xl border border-border border-b-0 bg-card px-3 pt-2.5 pb-7">
            {avatarOverlay ? (
              <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-0 overflow-visible">
                {avatarOverlay}
              </div>
            ) : null}
            {dockContent}
          </div>
        ) : null}
        {rendered ? (
          <CopilotComposerStatusFlap
            activityBaselineSignature={activityBaselineSignature}
            autoExpand={autoExpand}
            chatStatus={chatStatus}
            closing={closing}
            errorMessage={errorMessage}
            expandedContentHeight={compactStatusFlapHeight}
            idlePreviewText={idlePreviewText || null}
            interruptContent={interruptContent}
            labels={
              // Until the run produces activity, the ticker line is the just-
              // sent user message (with spinner) instead of a generic
              // "Waiting…" — so the send is visibly acknowledged.
              sendingUserText
                ? {
                    ...labels,
                    thinking: sendingUserText,
                    waiting: sendingUserText,
                  }
                : labels
            }
            messages={messages}
            onExpandedContentHeightChange={onCompactStatusFlapHeightChange}
            overlayAdornment={avatarOverlay}
            replyText={replyText}
            runStatus={runStatus}
            stale={stale}
          />
        ) : null}
        {rendered || hasDockContent ? null : avatarOverlay}
        <div
          className={cn(
            "relative z-10 border-red transition-all duration-200",
            cardVariantClasses[variant],
            dense
              ? "rounded-[1.35rem] px-2 py-1"
              : "rounded-[1.7rem] px-4 py-[0.7rem]"
          )}
          data-variant={variant}
          onInput={(e) => {
            const textarea = e.currentTarget.querySelector("textarea");
            setHasContent(textarea ? textarea.value.trim().length > 0 : false);
          }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          ref={cardRef}
        >
          {cardChrome}
          {children}
        </div>
      </div>
      {belowCard || showUsageMeter ? (
        <div
          className={cn(
            "flex items-center justify-between gap-2 pl-1 transition-all duration-300 ease-in-out",
            active
              ? // Soft card-colored frost behind the meta row (no border/chrome) —
                // keeps model/context labels readable over busy page content.
                "relative isolate mt-1 h-7 text-foreground opacity-100 before:pointer-events-none before:absolute before:-inset-x-3 before:-inset-y-1.5 before:-z-10 before:rounded-lg before:bg-card/75 before:shadow-[0_0_20px_14px_color-mix(in_oklch,var(--card)_70%,transparent)] supports-[backdrop-filter]:before:bg-card/50 supports-[backdrop-filter]:before:backdrop-blur-md"
              : "pointer-events-none mt-0 h-0 overflow-hidden opacity-0"
          )}
        >
          {belowCard ?? <span />}
          {showUsageMeter ? (
            <CopilotComposerUsageMeter
              chatStatus={chatStatus}
              className="ml-auto pr-1.5 text-right"
              threadId={threadId}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
