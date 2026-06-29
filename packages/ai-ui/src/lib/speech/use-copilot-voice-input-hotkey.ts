"use client";

import { useHotkey } from "@tanstack/react-hotkeys";
import type { RefObject } from "react";
import { useCallback } from "react";

export const COPILOT_VOICE_INPUT_HOTKEY = "Mod+." as const;

export const COPILOT_DRAWER_PANEL_ATTR = "data-copilot-drawer-panel";
export const COPILOT_SPEECH_SCOPE_ATTR = "data-copilot-speech-scope";

export interface UseCopilotVoiceInputHotkeyOptions {
  disabled?: boolean;
  isProcessing: boolean;
  isSupported: boolean;
  onToggle: () => void;
  scopeRef: RefObject<HTMLElement | null>;
}

export function resolveCopilotSpeechScopeRoot(
  composerRoot: HTMLElement | null
): HTMLElement | null {
  if (!composerRoot) {
    return null;
  }
  return (
    composerRoot.closest(`[${COPILOT_DRAWER_PANEL_ATTR}]`) ??
    composerRoot.closest(`[${COPILOT_SPEECH_SCOPE_ATTR}]`) ??
    composerRoot
  );
}

export function shouldHandleCopilotVoiceHotkey(
  event: Pick<KeyboardEvent, "target">,
  scopeRoot: HTMLElement | null
): boolean {
  if (!scopeRoot) {
    return false;
  }
  const target = event.target;
  if (!(target instanceof Node)) {
    return false;
  }
  return scopeRoot.contains(target);
}

export function useCopilotVoiceInputHotkey({
  disabled = false,
  isProcessing,
  isSupported,
  onToggle,
  scopeRef,
}: UseCopilotVoiceInputHotkeyOptions): void {
  const isActive = !disabled && isSupported && !isProcessing;

  const handleToggle = useCallback(
    (event: KeyboardEvent) => {
      if (!shouldHandleCopilotVoiceHotkey(event, scopeRef.current)) {
        return;
      }
      if (event.isComposing) {
        return;
      }
      onToggle();
    },
    [onToggle, scopeRef]
  );

  useHotkey(COPILOT_VOICE_INPUT_HOTKEY, handleToggle, {
    conflictBehavior: "allow",
    enabled: isActive,
    meta: {
      description: "Toggle voice dictation in the copilot composer",
      name: "Copilot voice input (Mod+.)",
    },
    target: scopeRef,
  });
}
