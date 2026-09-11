// Full-page copilot chat routes. Sub-run monitor reuses the thread route with a
// `?subRun=<toolCallId>` query param — no nested route or second session host.

import {
  canonicalModulePathname,
  isAgentThreadId,
} from "@engenty/ai-core/browser";

const COPILOT_MODULE_ID = "engenty-copilot";
export const COPILOT_CHAT_ROOT = `/mdl/${COPILOT_MODULE_ID}/chat`;
export const COPILOT_CHAT_NEW = `${COPILOT_CHAT_ROOT}/new`;
export const COPILOT_SUB_RUN_QUERY = "subRun";

/**
 * The canonical `/mdl/engenty-copilot/…` form of a copilot URL.
 *
 * Every matcher that reads a chat URL needs this first, or inside a space it
 * answers "not a chat route" about a chat route — and both consequences are
 * silent: the thread id in the link is never read, so a deep link opens the
 * last-active chat instead of the one it names; and the full page is mistaken
 * for the drawer, so the URL stops tracking which chat is open at all. See
 * `canonicalModulePathname` for the general shape of the trap.
 *
 * Copilot-specific only in that another module's route comes back UNTOUCHED —
 * the callers below all mean "is this a COPILOT chat route", and handing them a
 * canonicalised `/mdl/offers/chat/…` would let `startsWith` say yes.
 */
export function canonicalCopilotChatPathname(pathname: string): string {
  const canonical = canonicalModulePathname(pathname);
  return canonical.startsWith(`/mdl/${COPILOT_MODULE_ID}`)
    ? canonical
    : pathname.trim();
}

export function defaultCopilotSessionPath(threadId: string): string {
  return `${COPILOT_CHAT_ROOT}/${encodeURIComponent(threadId)}`;
}

/** Copilot's canonical full-page chat inside one Space. */
export function spaceCopilotChatPath(
  spaceKey: string,
  threadId?: string | null
): string {
  const root = `/s/${encodeURIComponent(spaceKey)}/copilot/chat`;
  const id = threadId?.trim() ?? "";
  return id ? `${root}/${encodeURIComponent(id)}` : root;
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
