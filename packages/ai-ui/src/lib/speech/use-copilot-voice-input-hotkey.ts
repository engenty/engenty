"use client";

import { HOTKEY_GROUP } from "@engenty/ui-core";
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
  /** Toggles speech-to-text dictation (not live voice). */
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

function isEditableChatTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target instanceof HTMLTextAreaElement) {
    return true;
  }
  if (target instanceof HTMLInputElement) {
    const type = target.type.toLowerCase();
    return type === "text" || type === "search" || type === "";
  }
  return target.isContentEditable;
}

/**
 * Mod+. only while focus is in a chat field inside the composer/panel scope.
 * Live voice (realtime) is a separate control and is not started here.
 */
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
  if (!scopeRoot.contains(target)) {
    return false;
  }
  return isEditableChatTarget(target);
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
      event.preventDefault();
      onToggle();
    },
    [onToggle, scopeRef]
  );

  // Document listener: a scoped `target` ref can miss registration when the
  // composer mounts after the first effect. Scope is enforced in the handler.
  useHotkey(COPILOT_VOICE_INPUT_HOTKEY, handleToggle, {
    conflictBehavior: "allow",
    enabled: isActive,
    meta: {
      description: "Toggle voice dictation while typing in a chat input",
      group: HOTKEY_GROUP.copilot,
      name: "Toggle voice dictation",
    },
  });
}
