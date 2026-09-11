/** @vitest-environment happy-dom */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SPEECH_SILENCE_AUTO_SEND_MS,
  resolveSpeechToTextMode,
  shouldTriggerSpeechSilenceAutoSend,
  useSpeechToText,
} from "./use-speech-to-text.js";

interface MockResult {
  0: { transcript: string };
  isFinal: boolean;
}

class MockSpeechRecognition {
  continuous = false;
  interimResults = false;
  lang = "en-US";
  onend: ((this: MockSpeechRecognition, ev: Event) => void) | null = null;
  onerror: ((this: MockSpeechRecognition, ev: Event) => void) | null = null;
  onresult:
    | ((
        this: MockSpeechRecognition,
        ev: { resultIndex: number; results: MockResult[] }
      ) => void)
    | null = null;

  start = vi.fn(() => {
    MockSpeechRecognition.lastInstance = this;
  });
  stop = vi.fn();
  abort = vi.fn();

  static lastInstance: MockSpeechRecognition | null = null;
}

function installSpeechRecognitionMock() {
  // @ts-expect-error test mock
  window.SpeechRecognition = MockSpeechRecognition;
  window.webkitSpeechRecognition = undefined;
}

function clearSpeechRecognitionMock() {
  window.SpeechRecognition = undefined;
  window.webkitSpeechRecognition = undefined;
}

describe("resolveSpeechToTextMode", () => {
  afterEach(() => {
    clearSpeechRecognitionMock();
  });

  it("prefers web speech when available", () => {
    installSpeechRecognitionMock();
    expect(resolveSpeechToTextMode()).toBe("web-speech");
  });

  it("falls back to media recorder when transcribe callback exists", () => {
    clearSpeechRecognitionMock();
    class MockMediaRecorder {
      static isTypeSupported() {
        return true;
      }
      start = vi.fn();
      stop = vi.fn();
    }
    // @ts-expect-error test mock
    globalThis.MediaRecorder = MockMediaRecorder;

    expect(resolveSpeechToTextMode(async (_blob, _language) => "hello")).toBe(
      "media-recorder"
    );
  });
});

describe("shouldTriggerSpeechSilenceAutoSend", () => {
  it("requires speech activity and non-empty draft", () => {
    expect(
      shouldTriggerSpeechSilenceAutoSend({
        draft: "Hallo",
        hasSpeechThisSession: true,
      })
    ).toBe(true);
    expect(
      shouldTriggerSpeechSilenceAutoSend({
        draft: "   ",
        hasSpeechThisSession: true,
      })
    ).toBe(false);
    expect(
      shouldTriggerSpeechSilenceAutoSend({
        draft: "Hallo",
        hasSpeechThisSession: false,
      })
    ).toBe(false);
  });
});

describe("useSpeechToText silence auto-send", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockSpeechRecognition.lastInstance = null;
    installSpeechRecognitionMock();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    clearSpeechRecognitionMock();
  });

  it("auto-sends after silence when speech text exists", () => {
    let draft = "";
    const onDraftChange = vi.fn((value: string) => {
      draft = value;
    });
    const onSilenceAutoSend = vi.fn();

    const { result, rerender } = renderHook(() =>
      useSpeechToText({
        draft,
        enabled: true,
        lang: "en-US",
        onDraftChange,
        onSilenceAutoSend,
        silenceAutoSendMs: DEFAULT_SPEECH_SILENCE_AUTO_SEND_MS,
      })
    );

    act(() => {
      result.current.toggle();
    });

    const instance = MockSpeechRecognition.lastInstance;
    act(() => {
      instance?.onresult?.({
        resultIndex: 0,
        results: [{ isFinal: true, 0: { transcript: "hello" } }],
      });
    });

    rerender();
    expect(draft).toBe("hello");

    act(() => {
      vi.advanceTimersByTime(DEFAULT_SPEECH_SILENCE_AUTO_SEND_MS);
    });

    expect(onSilenceAutoSend).toHaveBeenCalledWith("hello");
    expect(result.current.isListening).toBe(false);
  });
});

describe("useSpeechToText", () => {
  beforeEach(() => {
    MockSpeechRecognition.lastInstance = null;
    installSpeechRecognitionMock();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearSpeechRecognitionMock();
  });

  it("merges interim and final transcript into draft", () => {
    let draft = "Hello";
    const onDraftChange = vi.fn((value: string) => {
      draft = value;
    });

    const { result, rerender } = renderHook(() =>
      useSpeechToText({
        draft,
        enabled: true,
        lang: "en-US",
        onDraftChange,
      })
    );

    act(() => {
      result.current.toggle();
    });

    const instance = MockSpeechRecognition.lastInstance;
    expect(instance).not.toBeNull();

    act(() => {
      instance?.onresult?.({
        resultIndex: 0,
        results: [{ isFinal: false, 0: { transcript: "world" } }],
      });
    });

    expect(onDraftChange).toHaveBeenCalledWith("Hello world");

    act(() => {
      instance?.onresult?.({
        resultIndex: 0,
        results: [{ isFinal: true, 0: { transcript: "world" } }],
      });
    });

    expect(onDraftChange).toHaveBeenLastCalledWith("Hello world");

    rerender();
    expect(result.current.isListening).toBe(true);
  });

  it("does not re-commit earlier final results when continuous events accumulate", () => {
    installSpeechRecognitionMock();
    const onDraftChange = vi.fn();
    const { result } = renderHook(() =>
      useSpeechToText({
        draft: "",
        enabled: true,
        lang: "de-DE",
        onDraftChange,
      })
    );

    act(() => {
      result.current.toggle();
    });
    const instance = MockSpeechRecognition.lastInstance;

    act(() => {
      instance?.onresult?.({
        resultIndex: 0,
        results: [
          { isFinal: true, 0: { transcript: "bitte den kontaktmanager" } },
        ],
      });
    });
    expect(onDraftChange).toHaveBeenLastCalledWith("bitte den kontaktmanager");

    act(() => {
      instance?.onresult?.({
        resultIndex: 1,
        results: [
          { isFinal: true, 0: { transcript: "bitte den kontaktmanager" } },
          { isFinal: false, 0: { transcript: "ob er" } },
        ],
      });
    });
    expect(onDraftChange).toHaveBeenLastCalledWith(
      "bitte den kontaktmanager ob er"
    );

    act(() => {
      instance?.onresult?.({
        resultIndex: 1,
        results: [
          { isFinal: true, 0: { transcript: "bitte den kontaktmanager" } },
          { isFinal: true, 0: { transcript: "ob er den Kontakt" } },
        ],
      });
    });
    expect(onDraftChange).toHaveBeenLastCalledWith(
      "bitte den kontaktmanager ob er den Kontakt"
    );
  });
});
