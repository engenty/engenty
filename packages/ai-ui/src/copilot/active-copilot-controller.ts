// Pure state machine for the active `engenty:copilot` host.
// Owns URL binding rules and new-chat generation; persisted active id lives in
// `threads-active-storage.ts` via EngentyThreadsProvider.

import { isAgentThreadId } from "@engenty/ai-core/browser";
import { finalizeAgentSessionStableKey } from "../agent-provider/affinity.js";
import { canonicalCopilotChatPathname } from "./copilot-chat-paths.js";

/** sessionStorage key — bumped on explicit "New chat" so each one creates a fresh server session. */
export const ACTIVE_COPILOT_NEW_CHAT_GENERATION_STORAGE_KEY =
  "engenty:copilot:new-chat-generation";

const ACTIVE_COPILOT_AFFINITY_VERSION = "active-v1";

const COPILOT_CHAT_PATH_PREFIX = "/mdl/engenty-copilot/chat";

function trimOrEmpty(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function createGenerationId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `gen-${Date.now()}`;
}

/** `/mdl/engenty-copilot/chat` with no thread segment — resume active copilot. */
export function isActiveCopilotChatIndexPathname(pathname: string): boolean {
  return canonicalCopilotChatPathname(pathname) === COPILOT_CHAT_PATH_PREFIX;
}

/** UUID in `/mdl/engenty-copilot/chat/:threadId` — null on `/new`, index, or non-chat paths. */
export function resolveAuthoritativeChatThreadIdFromPathname(
  pathname: string
): string | null {
  const normalized = canonicalCopilotChatPathname(pathname);
  if (normalized === `${COPILOT_CHAT_PATH_PREFIX}/new`) {
    return null;
  }
  if (!normalized.startsWith(`${COPILOT_CHAT_PATH_PREFIX}/`)) {
    return null;
  }
  const segment =
    normalized.slice(COPILOT_CHAT_PATH_PREFIX.length + 1).split("/")[0] ?? "";
  return isAgentThreadId(segment) ? segment : null;
}

export function readActiveCopilotNewChatGeneration(): string {
  if (typeof window === "undefined") {
    return createGenerationId();
  }
  try {
    const stored = window.sessionStorage
      .getItem(ACTIVE_COPILOT_NEW_CHAT_GENERATION_STORAGE_KEY)
      ?.trim();
    if (stored) {
      return stored;
    }
  } catch {
    // ignore
  }
  const created = createGenerationId();
  try {
    window.sessionStorage.setItem(
      ACTIVE_COPILOT_NEW_CHAT_GENERATION_STORAGE_KEY,
      created
    );
  } catch {
    // ignore
  }
  return created;
}

export function bumpActiveCopilotNewChatGeneration(): string {
  const next = createGenerationId();
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(
        ACTIVE_COPILOT_NEW_CHAT_GENERATION_STORAGE_KEY,
        next
      );
    } catch {
      // ignore
    }
  }
  return next;
}

export interface ActiveCopilotHostThreadIdInput {
  isChatIndexRoute: boolean;
  isFullPageChatRoute: boolean;
  isNewChatRoute: boolean;
  lastActiveThreadId: string | null;
  pathname: string;
}

export interface ActiveCopilotHostThreadIdResult {
  /** Active copilot thread bound to `EngentyAgent` / queries. */
  activeThreadId: string | null;
  /** Canonical uuid from the address bar when present (for reset guards). */
  authoritativeUrlThreadId: string | null;
}

function activeThreadIdFromLastActive(
  lastActiveThreadId: string | null
): string | null {
  const id = lastActiveThreadId?.trim() ?? "";
  return id && isAgentThreadId(id) ? id : null;
}

/**
 * Host binding: `/chat/new` → unbound; `/chat/:uuid` → that uuid;
 * `/chat` index → last-active; shell routes → last-active.
 */
export type PendingCopilotThreadNavigateAction =
  | { type: "clear" }
  | { type: "navigate"; threadId: string }
  | { type: "wait" };

/** Idle full-page URL sync after first send assigns a server thread id. */
export function resolvePendingCopilotThreadNavigate(input: {
  authoritativeUrlThreadId: string | null;
  hostReady: boolean;
  isFullPageChatRoute: boolean;
  pendingThreadId: string | null;
  routeThreadId: string | null;
}): PendingCopilotThreadNavigateAction {
  const pending = trimOrEmpty(input.pendingThreadId);
  if (!(pending && isAgentThreadId(pending))) {
    return { type: "wait" };
  }

  const urlMatches =
    input.authoritativeUrlThreadId === pending ||
    input.routeThreadId === pending;
  if (urlMatches) {
    return { type: "clear" };
  }

  if (!input.isFullPageChatRoute) {
    // Shell left full-page chat (e.g. navigate frontend tool) — last-active only.
    return { type: "clear" };
  }

  return { type: "navigate", threadId: pending };
}

/** Persist address-bar uuid to last-active only when it is not stale vs pending/last-active. */
export function shouldPersistCopilotUrlThreadToLastActive(input: {
  authoritativeUrlThreadId: string | null;
  pendingUrlThreadId: string | null;
  persistedLastActive: string | null;
}): boolean {
  const urlId = trimOrEmpty(input.authoritativeUrlThreadId);
  if (!(urlId && isAgentThreadId(urlId))) {
    return false;
  }
  const pending = trimOrEmpty(input.pendingUrlThreadId);
  if (pending && pending !== urlId) {
    return false;
  }
  const lastActive = trimOrEmpty(input.persistedLastActive);
  if (lastActive && lastActive !== urlId) {
    return false;
  }
  return lastActive !== urlId;
}

/** Replace stale `/chat/:old` with pending/last-active after first-send assign. */
export function shouldReconcileCopilotStaleSessionUrl(input: {
  authoritativeUrlThreadId: string | null;
  isFullPageChatRoute: boolean;
  pendingUrlThreadId: string | null;
  persistedLastActive: string | null;
}): boolean {
  if (!input.isFullPageChatRoute) {
    return false;
  }
  const urlId = trimOrEmpty(input.authoritativeUrlThreadId);
  const lastActive = trimOrEmpty(input.persistedLastActive);
  if (
    !(
      urlId &&
      lastActive &&
      isAgentThreadId(urlId) &&
      isAgentThreadId(lastActive)
    )
  ) {
    return false;
  }
  if (urlId === lastActive) {
    return false;
  }
  const pending = trimOrEmpty(input.pendingUrlThreadId);
  return pending === lastActive;
}

export function resolveActiveCopilotHostThreadId(
  input: ActiveCopilotHostThreadIdInput
): ActiveCopilotHostThreadIdResult {
  if (input.isNewChatRoute) {
    return { authoritativeUrlThreadId: null, activeThreadId: null };
  }

  const urlFromPath = resolveAuthoritativeChatThreadIdFromPathname(
    input.pathname
  );
  if (urlFromPath) {
    return {
      authoritativeUrlThreadId: urlFromPath,
      activeThreadId: urlFromPath,
    };
  }

  if (input.isFullPageChatRoute && input.isChatIndexRoute) {
    return {
      authoritativeUrlThreadId: null,
      activeThreadId: activeThreadIdFromLastActive(input.lastActiveThreadId),
    };
  }

  if (input.isFullPageChatRoute) {
    return { authoritativeUrlThreadId: null, activeThreadId: null };
  }

  return {
    authoritativeUrlThreadId: null,
    activeThreadId: activeThreadIdFromLastActive(input.lastActiveThreadId),
  };
}

export interface ActiveCopilotStableSessionKeyInput {
  agentId: string;
  /** Bumped only by explicit "New chat" UI actions; absent on first send. */
  newChatGeneration?: string | null;
  tenantId: string | null | undefined;
  userId: string | null | undefined;
}

/**
 * Deterministic affinity key (tenant + user + agent + optional generation).
 * Excludes module/route/scope so navigating Contacts → Tasks keeps the same
 * `/new` session candidate until the server assigns a real `threadId`.
 */
export function resolveActiveCopilotStableSessionKey(
  input: ActiveCopilotStableSessionKeyInput
): string | null {
  const tenantId = trimOrEmpty(input.tenantId);
  const userId = trimOrEmpty(input.userId);
  const agentId = trimOrEmpty(input.agentId);
  if (!(tenantId && userId && agentId)) {
    return null;
  }

  const parts = [
    "engenty-agent-affinity",
    ACTIVE_COPILOT_AFFINITY_VERSION,
    tenantId,
    userId,
    agentId,
  ];
  const generation = trimOrEmpty(input.newChatGeneration);
  if (generation) {
    parts.push(`new:${generation}`);
  }
  return finalizeAgentSessionStableKey(parts.join(":")) ?? null;
}
