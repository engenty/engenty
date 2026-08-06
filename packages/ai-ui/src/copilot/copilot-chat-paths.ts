// Full-page copilot chat routes. Sub-run monitor reuses the thread route with a
// `?subRun=<toolCallId>` query param — no nested route or second session host.

import { isAgentThreadId } from "@engenty/ai-core/browser";

export const COPILOT_CHAT_ROOT = "/mdl/engenty-copilot/chat";
export const COPILOT_CHAT_NEW = `${COPILOT_CHAT_ROOT}/new`;
export const COPILOT_SUB_RUN_QUERY = "subRun";

export function defaultCopilotSessionPath(threadId: string): string {
  return `${COPILOT_CHAT_ROOT}/${encodeURIComponent(threadId)}`;
}

/**
 * Path for the Position menu "Full Screen" action: deep-link the active
 * server thread when known, otherwise `/chat` (entry resolves last-active).
 */
export function resolveFullscreenCopilotChatPath(
  activeThreadId: string | null | undefined
): string {
  const id = activeThreadId?.trim() ?? "";
  if (id && isAgentThreadId(id)) {
    return defaultCopilotSessionPath(id);
  }
  return COPILOT_CHAT_ROOT;
}

export function copilotChatSubRunPath(
  threadId: string,
  toolCallId: string
): string {
  const base = defaultCopilotSessionPath(threadId);
  const params = new URLSearchParams();
  params.set(COPILOT_SUB_RUN_QUERY, toolCallId);
  return `${base}?${params.toString()}`;
}

export function readCopilotSubRunToolCallId(search: string): string | null {
  const raw = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search
  ).get(COPILOT_SUB_RUN_QUERY);
  const trimmed = raw?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}
