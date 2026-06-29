"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type BrowserSpeechRecognition,
  getSpeechRecognitionConstructor,
  type SpeechRecognitionEvent,
} from "./speech-recognition-types.js";

export type SpeechToTextMode = "web-speech" | "media-recorder" | "unsupported";

export type TranscribeSpeechAudio = (
  blob: Blob,
  language: string
) => Promise<string>;

export const DEFAULT_SPEECH_SILENCE_AUTO_SEND_MS = 2000;

export interface UseSpeechToTextOptions {
  draft: string;
  enabled?: boolean;
  lang?: string;
  onDraftChange: (value: string) => void;
  /** Fired after sustained silence while listening once speech text exists. */
  onSilenceAutoSend?: (text: string) => void;
  silenceAutoSendMs?: number;
  transcribeAudio?: TranscribeSpeechAudio;
}

export interface UseSpeechToTextResult {
  error: string | null;
  isListening: boolean;
  isProcessing: boolean;
  isSupported: boolean;
  mode: SpeechToTextMode;
  startListening: () => void;
  stopListening: () => void;
  toggle: () => void;
}

function joinDraftParts(prefix: string, spoken: string): string {
  const base = prefix.trimEnd();
  const next = spoken.trim();
  if (!next) {
    return base;
  }
  if (!base) {
    return next;
  }
  return `${base} ${next}`;
}

function collectTranscriptFromEvent(event: SpeechRecognitionEvent): {
  finalText: string;
  interimText: string;
} {
  let finalText = "";
  let interimText = "";
  for (let index = 0; index < event.results.length; index += 1) {
    const result =
      typeof event.results.item === "function"
        ? event.results.item(index)
        : event.results[index];
    const transcript = result[0]?.transcript ?? "";
    if (result.isFinal) {
      finalText += transcript;
    } else {
      interimText += transcript;
    }
  }
  return { finalText, interimText };
}

export function shouldTriggerSpeechSilenceAutoSend(input: {
  draft: string;
  hasSpeechThisSession: boolean;
}): boolean {
  return input.hasSpeechThisSession && input.draft.trim().length > 0;
}

export function resolveSpeechToTextMode(
  transcribeAudio?: TranscribeSpeechAudio
): SpeechToTextMode {
  if (getSpeechRecognitionConstructor()) {
    return "web-speech";
  }
  if (
    typeof navigator !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    transcribeAudio
  ) {
    return "media-recorder";
  }
  return "unsupported";
}

export function useSpeechToText({
  draft,
  enabled = true,
  lang = "en-US",
  onDraftChange,
  onSilenceAutoSend,
  silenceAutoSendMs = DEFAULT_SPEECH_SILENCE_AUTO_SEND_MS,
  transcribeAudio,
}: UseSpeechToTextOptions): UseSpeechToTextResult {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mode = resolveSpeechToTextMode(transcribeAudio);
  const isSupported = enabled && mode !== "unsupported";

  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const prefixRef = useRef("");
  const committedRef = useRef("");
  const chunksRef = useRef<Blob[]>([]);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const onSilenceAutoSendRef = useRef(onSilenceAutoSend);
  onSilenceAutoSendRef.current = onSilenceAutoSend;
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasSpeechThisSessionRef = useRef(false);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const stopMediaStream = useCallback(() => {
    for (const track of mediaStreamRef.current?.getTracks() ?? []) {
      track.stop();
    }
    mediaStreamRef.current = null;
  }, []);

  const stopWebSpeech = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
  }, []);

  const stopMediaRecorder = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }, []);

  const cleanup = useCallback(() => {
    clearSilenceTimer();
    stopWebSpeech();
    stopMediaRecorder();
    stopMediaStream();
    setIsListening(false);
    hasSpeechThisSessionRef.current = false;
  }, [clearSilenceTimer, stopMediaRecorder, stopMediaStream, stopWebSpeech]);

  useEffect(() => cleanup, [cleanup]);

  const scheduleSilenceAutoSend = useCallback(() => {
    clearSilenceTimer();
    if (!onSilenceAutoSendRef.current || silenceAutoSendMs <= 0) {
      return;
    }

    silenceTimerRef.current = setTimeout(() => {
      silenceTimerRef.current = null;
      if (
        !shouldTriggerSpeechSilenceAutoSend({
          draft: draftRef.current,
          hasSpeechThisSession: hasSpeechThisSessionRef.current,
        })
      ) {
        return;
      }

      const text = draftRef.current.trim();
      stopWebSpeech();
      setIsListening(false);
      hasSpeechThisSessionRef.current = false;
      onSilenceAutoSendRef.current?.(text);
    }, silenceAutoSendMs);
  }, [clearSilenceTimer, silenceAutoSendMs, stopWebSpeech]);

  const applyDraft = useCallback(
    (spoken: string) => {
      const next = joinDraftParts(prefixRef.current, spoken);
      draftRef.current = next;
      onDraftChange(next);
    },
    [onDraftChange]
  );

  const startWebSpeech = useCallback(() => {
    const SpeechRecognition = getSpeechRecognitionConstructor();
    if (!SpeechRecognition) {
      return;
    }

    prefixRef.current = draftRef.current;
    committedRef.current = "";
    hasSpeechThisSessionRef.current = false;
    clearSilenceTimer();

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang;

    recognition.onresult = (event) => {
      const { finalText, interimText } = collectTranscriptFromEvent(event);
      if (finalText.trim() || interimText.trim()) {
        hasSpeechThisSessionRef.current = true;
      }
      if (finalText) {
        committedRef.current = joinDraftParts(committedRef.current, finalText);
      }
      applyDraft(joinDraftParts(committedRef.current, interimText));
      scheduleSilenceAutoSend();
    };

    recognition.onerror = (event) => {
      if (event.error === "aborted" || event.error === "no-speech") {
        return;
      }
      setError(event.error);
      cleanup();
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      clearSilenceTimer();
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
    setError(null);
  }, [applyDraft, clearSilenceTimer, lang, scheduleSilenceAutoSend]);

  const startMediaRecorder = useCallback(async () => {
    if (!transcribeAudio) {
      return;
    }

    prefixRef.current = draftRef.current;
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        stopMediaStream();
        mediaRecorderRef.current = null;
        setIsListening(false);

        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        chunksRef.current = [];

        if (blob.size === 0) {
          return;
        }

        setIsProcessing(true);
        setError(null);
        try {
          const text = await transcribeAudio(blob, lang);
          if (text.trim()) {
            onDraftChange(joinDraftParts(prefixRef.current, text));
          }
        } catch (cause) {
          setError(
            cause instanceof Error ? cause.message : "Transcription failed"
          );
        } finally {
          setIsProcessing(false);
        }
      };

      recorder.start();
      setIsListening(true);
      setError(null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Microphone access denied"
      );
      cleanup();
    }
  }, [cleanup, lang, onDraftChange, stopMediaStream, transcribeAudio]);

  const startListening = useCallback(() => {
    if (!isSupported || isProcessing || isListening) {
      return;
    }

    if (mode === "web-speech") {
      startWebSpeech();
      return;
    }

    void startMediaRecorder();
  }, [
    isListening,
    isProcessing,
    isSupported,
    mode,
    startMediaRecorder,
    startWebSpeech,
  ]);

  const stopListening = useCallback(() => {
    if (!isListening) {
      return;
    }

    clearSilenceTimer();
    if (mode === "web-speech") {
      stopWebSpeech();
      setIsListening(false);
      return;
    }

    stopMediaRecorder();
  }, [clearSilenceTimer, isListening, mode, stopMediaRecorder, stopWebSpeech]);

  const toggle = useCallback(() => {
    if (!isSupported || isProcessing) {
      return;
    }

    if (isListening) {
      stopListening();
      return;
    }

    startListening();
  }, [isListening, isProcessing, isSupported, startListening, stopListening]);

  return {
    error,
    isListening,
    isProcessing,
    isSupported,
    mode,
    startListening,
    stopListening,
    toggle,
  };
}
