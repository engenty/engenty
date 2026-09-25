"use client";

import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import {
  AnchoredGuidePopout,
  type GuideCardText,
  GuideCardTextContext,
  ModalGuideCard,
} from "./guide-card.js";
import {
  HighlightRing,
  ModalBackdrop,
  readTargetRect,
  SpotlightPanes,
  type TargetRect,
} from "./guide-chrome.js";
import { formatUiGuideFollowUpMessage } from "./resolve-target.js";
import {
  getUiGuideSession,
  resolveUiGuideAction,
  subscribeUiGuide,
} from "./session.js";

export interface GuideOverlayHostProps {
  /**
   * Called when the user activates a guide action while `wait` is false.
   * Pure dismiss / Esc does not call this.
   */
  onFollowUpMessage?: (text: string) => void;
  /** The close button's label and the body's Markdown renderer. */
  text?: GuideCardText;
}

export function GuideOverlayHost({
  onFollowUpMessage,
  text,
}: GuideOverlayHostProps): ReactNode {
  const session = useSyncExternalStore(
    subscribeUiGuide,
    getUiGuideSession,
    () => null
  );
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);

  useLayoutEffect(() => {
    if (!session) {
      setTargetRect(null);
      return;
    }
    const el = session.target_element;
    if (!el) {
      setTargetRect(null);
      return;
    }
    if (!el.isConnected) {
      resolveUiGuideAction({ action_id: "dismiss", dismiss: true });
      return;
    }
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
    const update = () => setTargetRect(readTargetRect(el));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [session]);

  useEffect(() => {
    if (!session) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        resolveUiGuideAction({ action_id: "dismiss", dismiss: true });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [session]);

  if (!session || typeof document === "undefined") {
    return null;
  }

  const needsTarget =
    session.presentation === "spotlight" ||
    session.presentation === "highlight";
  if (needsTarget && !targetRect) {
    return null;
  }

  const handleAction = (
    workflowId: string,
    inputValue?: string,
    inputValues?: Record<string, string>
  ) => {
    const outcome = resolveUiGuideAction({
      action_id: workflowId,
      input_value: inputValue,
      input_values: inputValues,
    });
    if (!outcome) {
      return;
    }
    if (outcome.followUp) {
      onFollowUpMessage?.(
        formatUiGuideFollowUpMessage({
          action_id: workflowId,
          guide_id: outcome.result.guide_id,
          input_value: inputValue,
          input_values: inputValues,
          label: session.actions.find((action) => action.id === workflowId)
            ?.label,
          title: session.title,
        })
      );
    }
  };

  const handleDismiss = () => {
    resolveUiGuideAction({ action_id: "dismiss", dismiss: true });
  };

  const card =
    session.presentation === "modal" ? (
      <ModalGuideCard
        onAction={handleAction}
        onDismiss={handleDismiss}
        session={session}
      />
    ) : targetRect ? (
      <AnchoredGuidePopout
        onAction={handleAction}
        onDismiss={handleDismiss}
        session={session}
        targetRect={targetRect}
      />
    ) : null;

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[180]">
      {session.presentation === "spotlight" && targetRect ? (
        <div className="pointer-events-auto">
          <SpotlightPanes
            allowTargetInteraction={session.allow_target_interaction}
            rect={targetRect}
          />
        </div>
      ) : null}
      {session.presentation === "modal" ? (
        <div className="pointer-events-auto">
          <ModalBackdrop />
        </div>
      ) : null}
      {session.presentation === "highlight" && targetRect ? (
        <HighlightRing rect={targetRect} />
      ) : null}
      {session.presentation === "modal" && targetRect ? (
        <HighlightRing rect={targetRect} />
      ) : null}
      <div className="pointer-events-auto">
        {text ? (
          <GuideCardTextContext.Provider value={text}>
            {card}
          </GuideCardTextContext.Provider>
        ) : (
          card
        )}
      </div>
    </div>,
    document.body
  );
}
