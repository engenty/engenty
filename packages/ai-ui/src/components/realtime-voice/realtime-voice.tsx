"use client";

import { Button, cn } from "@engenty/ui-core";
import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import { Mic, MicOff, PhoneOff, Volume2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type RealtimeVoiceUiStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "speaking"
  | "muted"
  | "ended"
  | "error";

export interface RealtimeVoiceUiLabels {
  assistant?: string;
  end?: string;
  ended?: string;
  error?: string;
  idle?: string;
  listening?: string;
  mute?: string;
  muted?: string;
  speaking?: string;
  start?: string;
  starting?: string;
  unmute?: string;
  user?: string;
}

export interface RealtimeVoiceUiState {
  end: () => void;
  error: string | null;
  isActive: boolean;
  isMuted: boolean;
  setError: (message: string) => void;
  setListening: () => void;
  setSpeaking: () => void;
  start: () => void;
  status: RealtimeVoiceUiStatus;
  toggleMute: () => void;
}

export interface UseRealtimeVoiceUiStateOptions {
  autoListenDelayMs?: number;
  enabled?: boolean;
}

const ACTIVE_STATUSES = new Set<RealtimeVoiceUiStatus>([
  "connecting",
  "listening",
  "speaking",
  "muted",
]);

export function useRealtimeVoiceUiState({
  autoListenDelayMs = 450,
  enabled = true,
}: UseRealtimeVoiceUiStateOptions = {}): RealtimeVoiceUiState {
  const [status, setStatus] = useState<RealtimeVoiceUiStatus>("idle");
  const [error, setErrorState] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearStartTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => clearStartTimer, [clearStartTimer]);

  const start = useCallback(() => {
    if (!enabled) {
      return;
    }
    clearStartTimer();
    setErrorState(null);
    setStatus("connecting");
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setStatus("listening");
    }, autoListenDelayMs);
  }, [autoListenDelayMs, clearStartTimer, enabled]);

  const end = useCallback(() => {
    clearStartTimer();
    setErrorState(null);
    setStatus("ended");
  }, [clearStartTimer]);

  const setError = useCallback(
    (message: string) => {
      clearStartTimer();
      setErrorState(message);
      setStatus("error");
    },
    [clearStartTimer]
  );

  const setListening = useCallback(() => {
    if (enabled) {
      clearStartTimer();
      setStatus("listening");
    }
  }, [clearStartTimer, enabled]);

  const setSpeaking = useCallback(() => {
    if (enabled) {
      clearStartTimer();
      setStatus("speaking");
    }
  }, [clearStartTimer, enabled]);

  const toggleMute = useCallback(() => {
    if (!enabled) {
      return;
    }
    clearStartTimer();
    setStatus((current) => (current === "muted" ? "listening" : "muted"));
  }, [clearStartTimer, enabled]);

  const isActive = ACTIVE_STATUSES.has(status);

  return useMemo(
    () => ({
      end,
      error,
      isActive,
      isMuted: status === "muted",
      setError,
      setListening,
      setSpeaking,
      start,
      status,
      toggleMute,
    }),
    [
      end,
      error,
      isActive,
      setError,
      setListening,
      setSpeaking,
      start,
      status,
      toggleMute,
    ]
  );
}

function statusLabel(
  status: RealtimeVoiceUiStatus,
  labels?: RealtimeVoiceUiLabels
): string {
  switch (status) {
    case "connecting":
      return labels?.starting ?? "Connecting";
    case "listening":
      return labels?.listening ?? "Listening";
    case "speaking":
      return labels?.speaking ?? "Speaking";
    case "muted":
      return labels?.muted ?? "Muted";
    case "ended":
      return labels?.ended ?? "Call ended";
    case "error":
      return labels?.error ?? "Voice unavailable";
    case "idle":
      return labels?.idle ?? "Voice";
  }
}

export interface RealtimeVoiceCallStripProps {
  caption?: string | null;
  className?: string;
  disabled?: boolean;
  error?: string | null;
  labels?: RealtimeVoiceUiLabels;
  onEnd: () => void;
  onToggleMute: () => void;
  status: RealtimeVoiceUiStatus;
}

export function RealtimeVoiceCallStrip({
  caption,
  className,
  disabled = false,
  error,
  labels,
  onEnd,
  onToggleMute,
  status,
}: RealtimeVoiceCallStripProps) {
  const muted = status === "muted";
  const busy = status === "connecting";
  const displayLabel = error || statusLabel(status, labels);
  const Icon = muted ? MicOff : status === "speaking" ? Volume2 : Mic;

  return (
    <div
      className={cn(
        "flex min-h-12 items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2 shadow-sm",
        className
      )}
      data-realtime-voice-status={status}
    >
      <div
        aria-hidden
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary",
          status === "listening" && "animate-pulse",
          status === "speaking" && "bg-emerald-500/10 text-emerald-600",
          muted && "bg-muted text-muted-foreground",
          status === "error" && "bg-destructive/10 text-destructive"
        )}
      >
        {busy ? (
          <AnimatedLoaderIcon play="always" size="sm" />
        ) : (
          <Icon className="size-4" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p aria-live="polite" className="truncate font-medium text-sm">
          {displayLabel}
        </p>
        <p className="truncate text-muted-foreground text-xs">
          {caption?.trim() || labels?.idle || "Realtime voice"}
        </p>
      </div>
      <Button
        aria-label={
          muted ? (labels?.unmute ?? "Unmute") : (labels?.mute ?? "Mute")
        }
        aria-pressed={muted}
        disabled={disabled || busy}
        onClick={onToggleMute}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        {muted ? (
          <MicOff aria-hidden className="size-4" />
        ) : (
          <Mic aria-hidden className="size-4" />
        )}
      </Button>
      <Button
        aria-label={labels?.end ?? "End voice chat"}
        disabled={disabled && status !== "error"}
        onClick={onEnd}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <PhoneOff aria-hidden className="size-4" />
      </Button>
    </div>
  );
}
