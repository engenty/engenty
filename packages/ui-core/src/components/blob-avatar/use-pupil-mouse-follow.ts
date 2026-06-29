"use client";

import type { RefObject } from "react";
import { useEffect } from "react";

const FOLLOW_MS = 4500;
const DRIFT_MS = 5500;
const MAX_OFFSET = 3;
const FULL_DEFLECTION_DISTANCE = 240;

/**
 * Periodically lets the blob pupil track the cursor: alternates between the
 * CSS drift animation and rAF-driven mouse following. While the user types,
 * the gaze locks onto the focused field's caret area. Skips while the pupil
 * is in its active (pulsing) state.
 */
export function usePupilMouseFollow(pupilRef: RefObject<SVGGElement | null>) {
  useEffect(() => {
    const pupil = pupilRef.current;
    if (!pupil || typeof window === "undefined") {
      return;
    }
    let following = false;
    let frame = 0;
    let lastEvent: MouseEvent | null = null;
    let typingTarget: HTMLElement | null = null;
    let typingUntil = 0;

    const release = () => {
      pupil.style.animation = "";
      pupil.style.transform = "";
      pupil.style.transition = "";
    };

    const resolveGazePoint = (): { x: number; y: number } | null => {
      if (typingTarget?.isConnected && performance.now() < typingUntil) {
        const rect = typingTarget.getBoundingClientRect();
        const caret = (
          typingTarget as Partial<Pick<HTMLTextAreaElement, "selectionEnd">>
        ).selectionEnd;
        const textLength = (
          typingTarget as Partial<Pick<HTMLTextAreaElement, "value">>
        ).value?.length;
        const progress =
          caret != null && textLength ? Math.min(1, caret / textLength) : 0.5;
        return {
          x: rect.left + 8 + (rect.width - 16) * progress,
          y: rect.top + Math.min(14, rect.height / 2),
        };
      }
      if (following && lastEvent != null) {
        return { x: lastEvent.clientX, y: lastEvent.clientY };
      }
      return null;
    };

    const apply = () => {
      frame = 0;
      const gaze = resolveGazePoint();
      if (gaze == null) {
        return;
      }
      if (pupil.dataset.active === "true") {
        release();
        return;
      }
      const box = pupil.ownerSVGElement?.getBoundingClientRect();
      if (!box || box.width === 0) {
        return;
      }
      const dx = gaze.x - (box.left + box.width / 2);
      const dy = gaze.y - (box.top + box.height / 2);
      const dist = Math.hypot(dx, dy);
      if (dist === 0) {
        return;
      }
      const reach = MAX_OFFSET * Math.min(1, dist / FULL_DEFLECTION_DISTANCE);
      pupil.style.animation = "none";
      pupil.style.transition = "transform 180ms ease-out";
      pupil.style.transform = `translate(${((dx / dist) * reach).toFixed(2)}px, ${((dy / dist) * reach).toFixed(2)}px)`;
    };

    const onMouseMove = (event: MouseEvent) => {
      lastEvent = event;
      if (following && frame === 0) {
        frame = window.requestAnimationFrame(apply);
      }
    };

    const TYPING_HOLD_MS = 2000;
    let typingReleaseTimer = 0;
    const onInput = (event: Event) => {
      if (!(event.target instanceof HTMLElement)) {
        return;
      }
      typingTarget = event.target;
      typingUntil = performance.now() + TYPING_HOLD_MS;
      if (frame === 0) {
        frame = window.requestAnimationFrame(apply);
      }
      window.clearTimeout(typingReleaseTimer);
      typingReleaseTimer = window.setTimeout(() => {
        if (performance.now() >= typingUntil && !following) {
          release();
        }
      }, TYPING_HOLD_MS + 100);
    };

    let phaseTimer = 0;
    const schedulePhase = () => {
      phaseTimer = window.setTimeout(
        () => {
          following = !following;
          if (following) {
            if (frame === 0) {
              frame = window.requestAnimationFrame(apply);
            }
          } else {
            release();
          }
          schedulePhase();
        },
        following ? FOLLOW_MS : DRIFT_MS
      );
    };
    schedulePhase();
    window.addEventListener("mousemove", onMouseMove, { passive: true });
    document.addEventListener("input", onInput, {
      capture: true,
      passive: true,
    });

    return () => {
      window.clearTimeout(phaseTimer);
      if (frame !== 0) {
        window.cancelAnimationFrame(frame);
      }
      window.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("input", onInput, { capture: true });
      window.clearTimeout(typingReleaseTimer);
      release();
    };
  }, [pupilRef]);
}
