export interface SpeechRecognitionAlternative {
  readonly confidence: number;
  readonly transcript: string;
}

export interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  item(index: number): SpeechRecognitionAlternative;
  readonly length: number;
  [index: number]: SpeechRecognitionAlternative;
}

export interface SpeechRecognitionResultList {
  item(index: number): SpeechRecognitionResult;
  readonly length: number;
  [index: number]: SpeechRecognitionResult;
}

export interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

export interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}

export interface BrowserSpeechRecognition extends EventTarget {
  abort(): void;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: ((this: BrowserSpeechRecognition, ev: Event) => void) | null;
  onerror:
    | ((
        this: BrowserSpeechRecognition,
        ev: SpeechRecognitionErrorEvent
      ) => void)
    | null;
  onresult:
    | ((this: BrowserSpeechRecognition, ev: SpeechRecognitionEvent) => void)
    | null;
  start(): void;
  stop(): void;
}

export type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export function getSpeechRecognitionConstructor():
  | SpeechRecognitionConstructor
  | undefined {
  if (typeof window === "undefined") {
    return;
  }
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

export function resolveSpeechRecognitionLang(locale?: string): string {
  if (!locale) {
    return "en-US";
  }
  const normalized = locale.toLowerCase();
  if (normalized.startsWith("de")) {
    return "de-DE";
  }
  if (normalized.startsWith("en")) {
    return "en-US";
  }
  return locale;
}
