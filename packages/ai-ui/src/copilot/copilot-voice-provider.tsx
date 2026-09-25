"use client";

import {
  memo,
  type ReactNode,
  useContext,
  useState,
  useSyncExternalStore,
} from "react";
import type { OpenAiRealtimeVoiceComposerControls } from "../ag-ui/apps-ai/index.js";
import { CopilotVoiceRuntime } from "./copilot-voice-runtime.js";
import {
  CopilotVoiceStoreContext,
  createCopilotVoiceStore,
  subscribeCopilotVoiceStore,
} from "./copilot-voice-store.js";

const CopilotVoiceChildren = memo(function CopilotVoiceChildren({
  children,
}: {
  children: ReactNode;
}) {
  return children;
});

export function CopilotVoiceProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createCopilotVoiceStore);
  return (
    <CopilotVoiceStoreContext.Provider value={store}>
      <CopilotVoiceRuntime store={store} />
      <CopilotVoiceChildren>{children}</CopilotVoiceChildren>
    </CopilotVoiceStoreContext.Provider>
  );
}

export function useCopilotVoice(): OpenAiRealtimeVoiceComposerControls {
  const store = useContext(CopilotVoiceStoreContext);
  if (!store) {
    throw new Error("useCopilotVoice must be used within CopilotVoiceProvider");
  }
  const snapshot = useSyncExternalStore(
    (listener) => subscribeCopilotVoiceStore(store, listener),
    () => store.snapshot,
    () => store.snapshot
  );
  if (!snapshot) {
    throw new Error("useCopilotVoice must be used within CopilotVoiceProvider");
  }
  return snapshot.realtimeVoice;
}

/** True while a voice call strip is mounted anywhere (composer override). */
export function useCopilotVoiceCallStripMounted(): boolean {
  const store = useContext(CopilotVoiceStoreContext);
  if (!store) {
    throw new Error(
      "useCopilotVoiceCallStripMounted must be used within CopilotVoiceProvider"
    );
  }
  const snapshot = useSyncExternalStore(
    (listener) => subscribeCopilotVoiceStore(store, listener),
    () => store.snapshot,
    () => store.snapshot
  );
  return snapshot?.callStripMounted ?? false;
}
