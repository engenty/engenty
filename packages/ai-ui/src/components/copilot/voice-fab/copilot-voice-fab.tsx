"use client";

import { useCopilotShellOrNull } from "@engenty/app-shell";
import { BlobAvatar, Button, cn } from "@engenty/ui-core";
import { Mic, MicOff, PhoneOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCopilotVoice } from "../../../copilot/copilot-voice-provider.js";
import type { RealtimeVoiceUiStatus } from "../../realtime-voice/realtime-voice.js";

/* -------------------------------------------------------------------------- */
/*  Inline styles (same pattern as blob-eye.tsx — injected via <style> tag)   */
/* -------------------------------------------------------------------------- */

const voiceFabStyles = `
/* ---- Wave pulse rings (speaking feedback) ---- */
@keyframes voice-wave-pulse {
  0% { transform: scale(1); opacity: 0.45; }
  100% { transform: scale(1.9); opacity: 0; }
}
.voice-fab-wave {
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  border: 2px solid #3358d4;
  pointer-events: none;
  animation: voice-wave-pulse 2s ease-out infinite;
}
.voice-fab-wave:nth-child(2) { animation-delay: 0.4s; }
.voice-fab-wave:nth-child(3) { animation-delay: 0.8s; }

/* ---- FAB container entry ---- */
@keyframes voice-fab-enter {
  from { opacity: 0; transform: scale(0.85) translateY(8px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
.voice-fab-root {
  animation: voice-fab-enter 0.35s ease-out both;
  background: none;
  border: none;
  outline: none;
  box-shadow: none;
}

/* ---- Fly-out menu ---- */
@keyframes voice-fab-menu-enter {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
.voice-fab-menu {
  animation: voice-fab-menu-enter 0.25s ease-out both;
}

/* ---- Muted badge pulse ---- */
@keyframes voice-fab-muted-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}
.voice-fab-muted-badge {
  animation: voice-fab-muted-pulse 2s ease-in-out infinite;
}

/* ---- Listening soft glow ---- */
@keyframes voice-fab-listening-glow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(51, 88, 212, 0.3); }
  50% { box-shadow: 0 0 0 8px rgba(51, 88, 212, 0); }
}
.voice-fab-listening {
  animation: voice-fab-listening-glow 2.5s ease-in-out infinite;
}

/* ---- Reduced motion ---- */
@media (prefers-reduced-motion: reduce) {
  .voice-fab-wave,
  .voice-fab-root,
  .voice-fab-menu,
  .voice-fab-muted-badge,
  .voice-fab-listening { animation: none; }
}
`;

/* -------------------------------------------------------------------------- */
/*  State mapping: voice status → BlobAvatar state                            */
/* -------------------------------------------------------------------------- */

type BlobState = "idle" | "thinking" | "streaming";

function blobStateFromVoiceStatus(status: RealtimeVoiceUiStatus): BlobState {
  switch (status) {
    case "connecting":
      return "thinking";
    case "speaking":
      return "streaming";
    default:
      return "idle";
  }
}

/* -------------------------------------------------------------------------- */
/*  CopilotVoiceFab                                                           */
/* -------------------------------------------------------------------------- */

export interface CopilotVoiceFabProps {
  /** Additional class names for the root container. */
  className?: string;
  /** When true, the FAB is hidden even if a voice session is active.
   *  Use this from the host app to suppress the FAB on full-page chat routes. */
  hidden?: boolean;
}

/**
 * Floating action button that surfaces the active realtime voice session as
 * a BlobAvatar in the bottom-right corner. Includes speaking wave feedback
 * and a fly-out menu with mute and end-call controls.
 *
 * Automatically hides when the copilot shell (drawer/sidebar/bottom/floating)
 * is open or when no voice session is active.
 */
export function CopilotVoiceFab({ className, hidden }: CopilotVoiceFabProps) {
  const { session } = useCopilotVoice();
  const shell = useCopilotShellOrNull();

  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- Visibility ----
  const shellOpen = shell?.open ?? false;
  const visible = session.isActive && !shellOpen && !hidden;

  // Auto-close the copilot drawer when a voice session starts so the FAB
  // becomes the primary voice UI surface.
  useEffect(() => {
    if (session.isActive && shell?.open) {
      shell.setOpen(false);
    }
  }, [session.isActive, shell]);

  // Close menu when FAB goes invisible
  useEffect(() => {
    if (!visible) {
      setMenuOpen(false);
    }
  }, [visible]);

  // Cleanup leave timer on unmount
  useEffect(
    () => () => {
      if (leaveTimerRef.current) {
        clearTimeout(leaveTimerRef.current);
      }
    },
    []
  );

  // ---- Escape key dismiss ----
  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMenuOpen(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [menuOpen]);

  // ---- Hover handlers (applied to the root container) ----
  const handlePointerEnter = useCallback(() => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
    setMenuOpen(true);
  }, []);

  const handlePointerLeave = useCallback(() => {
    leaveTimerRef.current = setTimeout(() => {
      setMenuOpen(false);
      leaveTimerRef.current = null;
    }, 300);
  }, []);

  const handleMuteToggle = useCallback(() => {
    session.toggleMute();
  }, [session]);

  const handleEnd = useCallback(() => {
    session.end();
    setMenuOpen(false);
  }, [session]);

  if (!visible) {
    return null;
  }

  const { status, isMuted } = session;
  const isSpeaking = status === "speaking";
  const isListening = status === "listening";
  const blobState = blobStateFromVoiceStatus(status);

  return (
    <>
      <style>{voiceFabStyles}</style>
      <div
        className={cn(
          "voice-fab-root fixed right-6 bottom-6 z-50 flex flex-col items-center gap-2",
          className
        )}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        ref={rootRef}
      >
        {/* ---- Fly-out menu ---- */}
        {menuOpen ? (
          <div
            className="voice-fab-menu flex flex-col items-center gap-1.5 rounded-xl border border-border bg-card/95 p-1.5 shadow-lg backdrop-blur-sm"
            role="menu"
          >
            {/* Mute / Unmute */}
            <Button
              aria-label={isMuted ? "Unmute" : "Mute"}
              className={cn(
                "h-10 w-10 rounded-lg",
                isMuted && "text-amber-500"
              )}
              onClick={handleMuteToggle}
              role="menuitem"
              size="icon"
              type="button"
              variant="ghost"
            >
              {isMuted ? (
                <MicOff aria-hidden className="size-5" />
              ) : (
                <Mic aria-hidden className="size-5" />
              )}
            </Button>

            {/* End call */}
            <Button
              aria-label="End voice chat"
              className="h-10 w-10 rounded-lg text-destructive hover:bg-destructive/10"
              onClick={handleEnd}
              role="menuitem"
              size="icon"
              type="button"
              variant="ghost"
            >
              <PhoneOff aria-hidden className="size-5" />
            </Button>
          </div>
        ) : null}

        {/* ---- FAB avatar ---- */}
        <div
          aria-label={
            isMuted
              ? "Voice chat muted"
              : isSpeaking
                ? "Assistant speaking"
                : "Voice chat active"
          }
          className={cn(
            "relative flex cursor-pointer items-center justify-center",
            "transition-transform duration-150 ease-out hover:scale-[1.08] active:scale-95",
            isListening && "voice-fab-listening"
          )}
          role="status"
        >
          {/* Speaking wave rings */}
          {isSpeaking ? (
            <>
              <span className="voice-fab-wave" />
              <span className="voice-fab-wave" />
              <span className="voice-fab-wave" />
            </>
          ) : null}

          {/* BlobAvatar */}
          <div className="pointer-events-none relative">
            <BlobAvatar character="pilot" state={blobState} />
          </div>

          {/* Muted badge */}
          {isMuted ? (
            <span
              aria-hidden
              className="voice-fab-muted-badge absolute -bottom-0.5 -left-0.5 flex size-5 items-center justify-center rounded-full bg-amber-500 text-white shadow-sm"
            >
              <MicOff className="size-3" />
            </span>
          ) : null}
        </div>
      </div>
    </>
  );
}
