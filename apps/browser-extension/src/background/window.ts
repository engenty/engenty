import { getState, patchState } from "./state.js";

/**
 * The bridge controls exactly ONE dedicated window it created itself — never
 * the user's other windows. Every command targets tabs inside it; closing it
 * ends command execution (windowClosed) until the panel reopens it.
 */
export async function getManagedWindowId(): Promise<number | null> {
  const state = await getState();
  if (state.windowId === null) {
    return null;
  }
  try {
    await chrome.windows.get(state.windowId);
    return state.windowId;
  } catch {
    await patchState({ windowId: null });
    return null;
  }
}

export async function ensureManagedWindow(): Promise<number> {
  const existing = await getManagedWindowId();
  if (existing !== null) {
    return existing;
  }
  const created = await chrome.windows.create({ type: "normal" });
  if (created?.id === undefined) {
    throw new Error("could not create the managed window");
  }
  await patchState({ windowId: created.id });
  return created.id;
}

export async function describeWindowState(): Promise<unknown> {
  const windowId = await getManagedWindowId();
  if (windowId === null) {
    return { open: false };
  }
  const tabs = await chrome.tabs.query({ windowId });
  const active = tabs.find((tab) => tab.active);
  return {
    active_tab_url: active?.url ?? null,
    open: true,
    tab_count: tabs.length,
    window_id: windowId,
  };
}

export function watchManagedWindow(onClosed: () => void): void {
  chrome.windows.onRemoved.addListener((closedWindowId) => {
    void (async () => {
      const state = await getState();
      if (state.windowId === closedWindowId) {
        await patchState({ windowId: null });
        onClosed();
      }
    })();
  });
}
