import {
  isAgentThreadId,
  spaceKeyFromPathname,
} from "@engenty/ai-core/browser";
import {
  copilotChatSubRunPath as aiUiCopilotChatSubRunPath,
  readCopilotSubRunToolCallId as aiUiReadCopilotSubRunToolCallId,
  canonicalCopilotChatPathname,
} from "@engenty/ai-ui";
import { matchPath } from "react-router-dom";

/**
 * The plugin id, on its own — the shell needs it without the route prefix to
 * recognise a copilot deep link (PLAN-spaces.md Phase C1). Derived from here so
 * the id and the path cannot drift apart.
 */
export const COPILOT_MODULE_ID = "engenty-copilot";

/** Engenty core copilot full-page chat routes (URL is source of truth). */
export const COPILOT_MODULE = `/mdl/${COPILOT_MODULE_ID}`;
export const COPILOT_CHAT_ROOT = `${COPILOT_MODULE}/chat`;
export const COPILOT_CHAT_NEW = `${COPILOT_CHAT_ROOT}/new`;
export const COPILOT_MEMORY = `${COPILOT_MODULE}/memory`;

export function copilotChatThreadPath(threadId: string): string {
  return `${COPILOT_CHAT_ROOT}/${encodeURIComponent(threadId)}`;
}

export interface CopilotChatEntryPathInput {
  /** Most recently opened session (localStorage) — `/chat` root redirect only. */
  lastActiveThreadId?: string | null;
  /** Sessions list, newest first — used when last-active is missing. */
  latestThreadIds?: readonly string[];
}

/**
 * `/chat` entry redirect: last-active → latest listed session → `/chat/new`.
 */
export function resolveCopilotChatEntryPath(
  input: CopilotChatEntryPathInput = {}
): string {
  const lastActive = input.lastActiveThreadId?.trim() ?? "";
  if (lastActive && isAgentThreadId(lastActive)) {
    return copilotChatThreadPath(lastActive);
  }

  for (const candidate of input.latestThreadIds ?? []) {
    const id = candidate.trim();
    if (id && isAgentThreadId(id)) {
      return copilotChatThreadPath(id);
    }
  }

  return COPILOT_CHAT_NEW;
}

/**
 * Keep a copilot entry target in the space the user is already standing in.
 *
 * `resolveCopilotChatEntryPath` still answers in canonical `/mdl/…` form —
 * that is what `/mdl/engenty-copilot/chat` and the tests speak. Following that
 * from `/s/<key>/copilot/chat` leaves the space layout for a frame, which is
 * what remounts the Work sidebar (and used to look like a full reload).
 */
export function localizeCopilotChatPath(
  canonicalPath: string,
  currentPathname: string
): string {
  const spaceKey = spaceKeyFromPathname(currentPathname);
  if (!(spaceKey && canonicalPath.startsWith(COPILOT_CHAT_ROOT))) {
    return canonicalPath;
  }
  return `/s/${encodeURIComponent(spaceKey)}/copilot/chat${canonicalPath.slice(COPILOT_CHAT_ROOT.length)}`;
}

export function isFullPageCopilotChatRoute(pathname: string): boolean {
  // Canonical first: inside a space this arrives as `/s/<key>/copilot/chat/…`,
  // and answering "no" there is what makes the full page behave like the
  // drawer — the URL then stops following which chat is open.
  const canonical = canonicalCopilotChatPathname(pathname);
  return (
    canonical === COPILOT_CHAT_ROOT ||
    canonical === COPILOT_CHAT_NEW ||
    canonical.startsWith(`${COPILOT_CHAT_ROOT}/`)
  );
}

export type ParsedCopilotChatRoute =
  | { kind: "index" }
  | { kind: "new" }
  | { kind: "thread"; threadId: string }
  | { kind: "invalid_thread"; rawId: string };

export function parseCopilotChatPathname(
  pathname: string
): ParsedCopilotChatRoute {
  const canonical = canonicalCopilotChatPathname(pathname);
  if (canonical === COPILOT_CHAT_ROOT) {
    return { kind: "index" };
  }
  if (canonical === COPILOT_CHAT_NEW) {
    return { kind: "new" };
  }
  const m = matchPath(
    { path: `${COPILOT_CHAT_ROOT}/:threadId`, end: true },
    canonical
  );
  const raw = m?.params.threadId?.trim() ?? "";
  if (!raw) {
    return { kind: "index" };
  }
  if (raw === "new") {
    return { kind: "new" };
  }
  if (isAgentThreadId(raw)) {
    return { kind: "thread", threadId: raw };
  }
  return { kind: "invalid_thread", rawId: raw };
}

/** Canonical `ai.agent_session.id` when the URL is `/mdl/engenty-copilot/chat/:threadId`. */
export function resolveCopilotChatThreadIdFromPathname(
  pathname: string
): string | null {
  const parsed = parseCopilotChatPathname(pathname);
  return parsed.kind === "thread" ? parsed.threadId : null;
}

export function copilotChatSubRunPath(
  threadId: string,
  toolCallId: string
): string {
  return aiUiCopilotChatSubRunPath(threadId, toolCallId);
}

export function readCopilotSubRunToolCallId(search: string): string | null {
  return aiUiReadCopilotSubRunToolCallId(search);
}
