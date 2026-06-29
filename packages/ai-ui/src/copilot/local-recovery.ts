export const COPILOT_LOCAL_RECOVERY_VERSION = 1 as const;

export type CopilotLocalRecoveryThreadKey = string | "new";

export interface CopilotLocalRecoveryV1 {
  composerDraft?: string;
  tenantId: string;
  threadId: CopilotLocalRecoveryThreadKey;
  userId: string;
  version: typeof COPILOT_LOCAL_RECOVERY_VERSION;
}

export function buildCopilotLocalRecoveryStorageKey(params: {
  tenantId: string;
  userId: string;
  threadId: CopilotLocalRecoveryThreadKey;
}): string {
  return `engenty:copilot:recovery:${params.tenantId}:${params.userId}:${params.threadId}`;
}

export function isCopilotComposerDraftRecoveryEnabled(): boolean {
  const raw = (
    import.meta as ImportMeta & { env?: Record<string, string | undefined> }
  ).env?.VITE_COPILOT_COMPOSER_DRAFT_RECOVERY;
  return raw !== "false";
}

function isBrowserStorageAvailable(): boolean {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

function parseRecoveryPayload(raw: string): CopilotLocalRecoveryV1 | null {
  try {
    const parsed = JSON.parse(raw) as Partial<CopilotLocalRecoveryV1>;
    if (
      parsed.version !== COPILOT_LOCAL_RECOVERY_VERSION ||
      typeof parsed.tenantId !== "string" ||
      typeof parsed.userId !== "string" ||
      typeof parsed.threadId !== "string"
    ) {
      return null;
    }
    if (
      parsed.composerDraft !== undefined &&
      typeof parsed.composerDraft !== "string"
    ) {
      return null;
    }
    return parsed as CopilotLocalRecoveryV1;
  } catch {
    return null;
  }
}

export function readCopilotLocalRecovery(params: {
  tenantId: string;
  userId: string;
  threadId: CopilotLocalRecoveryThreadKey;
}): CopilotLocalRecoveryV1 | null {
  if (!isBrowserStorageAvailable()) {
    return null;
  }
  const key = buildCopilotLocalRecoveryStorageKey(params);
  const raw = window.localStorage.getItem(key);
  if (!raw) {
    return null;
  }
  const parsed = parseRecoveryPayload(raw);
  if (!parsed) {
    window.localStorage.removeItem(key);
    return null;
  }
  if (
    parsed.tenantId !== params.tenantId ||
    parsed.userId !== params.userId ||
    parsed.threadId !== params.threadId
  ) {
    return null;
  }
  return parsed;
}

export function readCopilotComposerDraft(params: {
  tenantId: string;
  userId: string;
  threadId: CopilotLocalRecoveryThreadKey;
}): string {
  const recovery = readCopilotLocalRecovery(params);
  const draft = recovery?.composerDraft ?? "";
  return typeof draft === "string" ? draft : "";
}

export function writeCopilotComposerDraft(params: {
  tenantId: string;
  userId: string;
  threadId: CopilotLocalRecoveryThreadKey;
  composerDraft: string;
}): void {
  if (!isBrowserStorageAvailable()) {
    return;
  }
  const trimmed = params.composerDraft;
  const key = buildCopilotLocalRecoveryStorageKey(params);
  if (trimmed.length === 0) {
    window.localStorage.removeItem(key);
    return;
  }
  const payload: CopilotLocalRecoveryV1 = {
    version: COPILOT_LOCAL_RECOVERY_VERSION,
    tenantId: params.tenantId,
    userId: params.userId,
    threadId: params.threadId,
    composerDraft: trimmed,
  };
  window.localStorage.setItem(key, JSON.stringify(payload));
}

export function clearCopilotComposerDraft(params: {
  tenantId: string;
  userId: string;
  threadId: CopilotLocalRecoveryThreadKey;
}): void {
  if (!isBrowserStorageAvailable()) {
    return;
  }
  window.localStorage.removeItem(buildCopilotLocalRecoveryStorageKey(params));
}

export function moveCopilotComposerDraft(params: {
  fromThreadId: CopilotLocalRecoveryThreadKey;
  tenantId: string;
  toThreadId: CopilotLocalRecoveryThreadKey;
  userId: string;
}): void {
  const composerDraft = readCopilotComposerDraft({
    tenantId: params.tenantId,
    userId: params.userId,
    threadId: params.fromThreadId,
  });
  clearCopilotComposerDraft({
    tenantId: params.tenantId,
    userId: params.userId,
    threadId: params.fromThreadId,
  });
  if (!composerDraft.trim()) {
    return;
  }
  writeCopilotComposerDraft({
    tenantId: params.tenantId,
    userId: params.userId,
    threadId: params.toThreadId,
    composerDraft,
  });
}

function removeLocalStorageKeysByPrefix(prefix: string): void {
  if (!isBrowserStorageAvailable()) {
    return;
  }
  const keys: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(prefix)) {
      keys.push(key);
    }
  }
  for (const key of keys) {
    window.localStorage.removeItem(key);
  }
}

/** Clears Track C composer-draft recovery keys for the signed-in tenant user. */
export function clearAllCopilotLocalRecoveryForUser(params: {
  tenantId: string;
  userId: string;
}): void {
  const prefix = `engenty:copilot:recovery:${params.tenantId}:${params.userId}:`;
  removeLocalStorageKeysByPrefix(prefix);
}

export function extractLastUserMessageText(
  messages: readonly { role?: string; content?: unknown }[]
): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "user") {
      continue;
    }
    const content = message.content;
    if (typeof content === "string") {
      const trimmed = content.trim();
      return trimmed.length > 0 ? trimmed : null;
    }
    if (!Array.isArray(content)) {
      continue;
    }
    const textParts = content
      .map((part) => {
        if (
          part &&
          typeof part === "object" &&
          "type" in part &&
          (part as { type?: string }).type === "text" &&
          "text" in part &&
          typeof (part as { text?: unknown }).text === "string"
        ) {
          return (part as { text: string }).text;
        }
        return "";
      })
      .join("")
      .trim();
    if (textParts.length > 0) {
      return textParts;
    }
  }
  return null;
}
