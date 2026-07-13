import type { BridgeLinkMessage } from "../shared/messages.js";

/**
 * Durable extension state. `chrome.storage.local` survives service-worker
 * restarts and browser restarts, so a killed worker resumes cleanly from
 * here. The pending (unconfirmed) link and the activity feed are ephemeral
 * and live in `chrome.storage.session`.
 */
export interface BridgeState {
  allowedOrigins: string[];
  apiBaseUrl: string;
  connectionId: string;
  deviceLabel: string;
  installationId: string;
  linked: boolean;
  paused: boolean;
  /** Repeated 401s: token expired — the panel shows a re-link prompt. */
  relink: boolean;
  sessionId: string;
  token: string;
  windowId: number | null;
}

const STATE_KEY = "bridgeState";
const PENDING_LINK_KEY = "pendingLink";
const ACTIVITY_KEY = "activity";
const ACTIVITY_CAP = 50;

const DEFAULT_STATE: BridgeState = {
  allowedOrigins: [],
  apiBaseUrl: "",
  connectionId: "",
  deviceLabel: "",
  installationId: "",
  linked: false,
  paused: false,
  relink: false,
  sessionId: "",
  token: "",
  windowId: null,
};

export async function getState(): Promise<BridgeState> {
  const raw = await chrome.storage.local.get(STATE_KEY);
  const stored = raw[STATE_KEY] as Partial<BridgeState> | undefined;
  return { ...DEFAULT_STATE, ...(stored ?? {}) };
}

export async function patchState(
  patch: Partial<BridgeState>
): Promise<BridgeState> {
  const next = { ...(await getState()), ...patch };
  await chrome.storage.local.set({ [STATE_KEY]: next });
  return next;
}

export async function clearState(): Promise<void> {
  await chrome.storage.local.remove(STATE_KEY);
}

export interface PendingLink {
  origin: string;
  payload: BridgeLinkMessage;
}

export async function setPendingLink(
  pending: PendingLink | null
): Promise<void> {
  if (pending === null) {
    await chrome.storage.session.remove(PENDING_LINK_KEY);
    return;
  }
  await chrome.storage.session.set({ [PENDING_LINK_KEY]: pending });
}

export async function getPendingLink(): Promise<PendingLink | null> {
  const raw = await chrome.storage.session.get(PENDING_LINK_KEY);
  return (raw[PENDING_LINK_KEY] as PendingLink | undefined) ?? null;
}

/** One row per claimed command, rendered by the side panel's activity feed. */
export interface ActivityEvent {
  action: string;
  detail?: string;
  durationMs?: number;
  error?: string;
  id: string;
  status: "running" | "ok" | "error";
  ts: number;
}

export async function upsertActivity(event: ActivityEvent): Promise<void> {
  const raw = await chrome.storage.session.get(ACTIVITY_KEY);
  const existing = (raw[ACTIVITY_KEY] as ActivityEvent[] | undefined) ?? [];
  const without = existing.filter((e) => e.id !== event.id);
  const next = [event, ...without].slice(0, ACTIVITY_CAP);
  await chrome.storage.session.set({ [ACTIVITY_KEY]: next });
}
