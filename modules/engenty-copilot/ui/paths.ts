import { isAgentThreadId } from "@engenty/ai-core/browser";
import {
  copilotChatSubRunPath as aiUiCopilotChatSubRunPath,
  readCopilotSubRunToolCallId as aiUiReadCopilotSubRunToolCallId,
} from "@engenty/ai-ui";
import { matchPath } from "react-router-dom";

/** Engenty core copilot full-page chat routes (URL is source of truth). */
export const COPILOT_MODULE = "/mdl/engenty-copilot";
export const COPILOT_CHAT_ROOT = `${COPILOT_MODULE}/chat`;
export const COPILOT_CHAT_NEW = `${COPILOT_CHAT_ROOT}/new`;

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

export function isFullPageCopilotChatRoute(pathname: string): boolean {
  return (
    pathname === COPILOT_CHAT_ROOT ||
    pathname === COPILOT_CHAT_NEW ||
    pathname.startsWith(`${COPILOT_CHAT_ROOT}/`)
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
  if (pathname === COPILOT_CHAT_ROOT) {
    return { kind: "index" };
  }
  if (pathname === COPILOT_CHAT_NEW) {
    return { kind: "new" };
  }
  const m = matchPath(
    { path: `${COPILOT_CHAT_ROOT}/:threadId`, end: true },
    pathname
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
