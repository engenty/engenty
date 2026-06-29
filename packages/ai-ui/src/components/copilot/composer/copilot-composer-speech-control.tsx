"use client";

import type { UseSpeechToTextResult } from "../../../lib/speech/use-speech-to-text.js";
import { PromptInputSpeechButton } from "../../ai-elements/prompt-input/prompt-input-speech-button.js";

export interface CopilotComposerSpeechControlProps {
  listeningLabel?: string;
  speech: Pick<
    UseSpeechToTextResult,
    "isListening" | "isProcessing" | "isSupported" | "toggle"
  >;
  startLabel?: string;
  status: "ready" | "streaming" | "submitted" | "error";
  stopLabel?: string;
}

export function CopilotComposerSpeechControl({
  listeningLabel,
  speech,
  startLabel,
  status,
  stopLabel,
}: CopilotComposerSpeechControlProps) {
  if (!speech.isSupported) {
    return null;
  }

  return (
    <PromptInputSpeechButton
      disabled={status !== "ready"}
      isListening={speech.isListening}
      isProcessing={speech.isProcessing}
      listeningLabel={listeningLabel}
      onToggle={speech.toggle}
      startLabel={startLabel}
      stopLabel={stopLabel}
    />
  );
}
