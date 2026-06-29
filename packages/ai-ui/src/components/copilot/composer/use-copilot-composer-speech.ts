"use client";

import { useTranslation } from "@engenty/i18n/ui";
import { useMemo } from "react";
import { transcribeAudioViaAppsAi } from "../../../ag-ui/apps-ai/transcribe-audio.js";
import { resolveSpeechRecognitionLang } from "../../../lib/speech/speech-recognition-types.js";
import {
  type TranscribeSpeechAudio,
  useSpeechToText,
} from "../../../lib/speech/use-speech-to-text.js";

export interface UseCopilotComposerSpeechOptions {
  draft: string;
  onSilenceAutoSend?: (text: string) => void;
  setDraft: (value: string) => void;
  status: "ready" | "streaming" | "submitted" | "error";
  transcribeAudio?: TranscribeSpeechAudio;
  voiceInputEnabled?: boolean;
  voiceInputLang?: string;
}

export function useCopilotComposerSpeech({
  draft,
  onSilenceAutoSend,
  setDraft,
  status,
  transcribeAudio,
  voiceInputEnabled = true,
  voiceInputLang,
}: UseCopilotComposerSpeechOptions) {
  const { i18n } = useTranslation();

  const resolvedLang = useMemo(
    () =>
      voiceInputLang ??
      resolveSpeechRecognitionLang(
        i18n.language ||
          (typeof navigator === "undefined" ? undefined : navigator.language)
      ),
    [i18n.language, voiceInputLang]
  );

  const resolvedTranscribe = useMemo(
    () =>
      transcribeAudio ??
      ((blob: Blob, language: string) =>
        transcribeAudioViaAppsAi(blob, { language })),
    [transcribeAudio]
  );

  return useSpeechToText({
    draft,
    enabled: voiceInputEnabled,
    lang: resolvedLang,
    onDraftChange: setDraft,
    onSilenceAutoSend: status === "ready" ? onSilenceAutoSend : undefined,
    transcribeAudio: resolvedTranscribe,
  });
}
