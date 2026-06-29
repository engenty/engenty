import {
  buildAgUiMessagesFromSessionMessages,
  type PersistedAgUiSessionMessageRecord,
} from "@engenty/ai-core/browser";
import type { UIMessage } from "ai";
import type { CopilotPanelContentProps } from "../components/presentation.js";
import type { EngentyAgUiMessage } from "./conversation.js";

export type EngentyAgUiPanelStatus = CopilotPanelContentProps["status"];

export interface EngentyAgUiRouteContext {
  moduleId: string;
  pathname?: string;
  routeKey: string;
  scope?: Record<string, unknown>;
}

export function agUiMessagesFromAiSessionMessages(
  messages: readonly UIMessage[] | undefined
): EngentyAgUiMessage[] | undefined {
  if (!messages) {
    return;
  }
  return buildAgUiMessagesFromSessionMessages(
    messages as readonly PersistedAgUiSessionMessageRecord[]
  );
}
