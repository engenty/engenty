// How the agent's words sit in a chat: straight on the canvas, or in a bubble
// facing the person's own (a messenger). The app owns the choice (appearance
// settings) and writes it onto <html>, next to the theme; the transcript only
// reads it, so every chat surface follows without a provider in between.

import { useSyncExternalStore } from "react";

export type ChatStyle = "canvas" | "bubbles";

export const CHAT_STYLES: readonly ChatStyle[] = ["canvas", "bubbles"];

const ATTRIBUTE = "data-chat-style";

function readChatStyle(): ChatStyle {
  if (typeof document === "undefined") {
    return "canvas";
  }
  return document.documentElement.getAttribute(ATTRIBUTE) === "bubbles"
    ? "bubbles"
    : "canvas";
}

/** Called by the app when the setting resolves or is previewed. */
export function applyChatStyle(style: string | undefined): void {
  document.documentElement.setAttribute(
    ATTRIBUTE,
    style === "bubbles" ? "bubbles" : "canvas"
  );
}

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: [ATTRIBUTE],
  });
  return () => observer.disconnect();
}

export function useChatStyle(): ChatStyle {
  return useSyncExternalStore(subscribe, readChatStyle, () => "canvas");
}
