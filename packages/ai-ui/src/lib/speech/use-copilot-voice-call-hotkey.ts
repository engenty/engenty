"use client";

import { HOTKEY_GROUP } from "@engenty/ui-core";
import { useHotkey } from "@tanstack/react-hotkeys";

/**
 * Talk to the copilot from anywhere: starts a live voice conversation, the
 * same as "Voice" on the copilot's button. Mod+O opens it in text; this is
 * its voice twin.
 */
export const COPILOT_VOICE_CALL_HOTKEY = "Mod+Shift+O" as const;

export function useCopilotVoiceCallHotkey({
  enabled,
  isActive,
  start,
}: {
  enabled: boolean;
  /** A voice conversation is already running: the chord does nothing. */
  isActive: boolean;
  start: () => Promise<void>;
}) {
  useHotkey(
    COPILOT_VOICE_CALL_HOTKEY,
    (event) => {
      event.preventDefault();
      if (!isActive) {
        void start();
      }
    },
    {
      conflictBehavior: "allow",
      enabled,
      meta: {
        description: "Start a voice conversation with the copilot",
        group: HOTKEY_GROUP.general,
        name: "Talk to the copilot",
      },
    }
  );
}
