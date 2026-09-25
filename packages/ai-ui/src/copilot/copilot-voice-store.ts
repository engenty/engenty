"use client";

import { createContext } from "react";
import type { OpenAiRealtimeVoiceComposerControls } from "../ag-ui/apps-ai/index.js";

export interface CopilotVoiceContextValue {
  /** True while a RealtimeVoiceCallStrip (composer override) is mounted
   *  somewhere on screen — the voice FAB hides to avoid a duplicate surface. */
  callStripMounted: boolean;
  realtimeVoice: OpenAiRealtimeVoiceComposerControls;
}

export interface CopilotVoiceStore {
  listeners: Set<() => void>;
  snapshot: CopilotVoiceContextValue | null;
}

export function createCopilotVoiceStore(): CopilotVoiceStore {
  return { listeners: new Set(), snapshot: null };
}

export function subscribeCopilotVoiceStore(
  store: CopilotVoiceStore,
  listener: () => void
) {
  store.listeners.add(listener);
  return () => {
    store.listeners.delete(listener);
  };
}

export function emitCopilotVoiceStore(store: CopilotVoiceStore) {
  for (const listener of store.listeners) {
    listener();
  }
}

export const CopilotVoiceStoreContext = createContext<CopilotVoiceStore | null>(
  null
);
