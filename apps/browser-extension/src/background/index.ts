import { isBridgeLinkMessage, type PanelCommand } from "../shared/messages.js";
import { postDisconnect } from "./api.js";
import { isLoopRunning, sendHeartbeat, startClaimLoop } from "./loop.js";
import {
  clearState,
  getPendingLink,
  getState,
  patchState,
  setPendingLink,
} from "./state.js";
import { ensureManagedWindow, watchManagedWindow } from "./window.js";

const HEARTBEAT_ALARM = "browser-bridge-heartbeat";
// MV3 kills idle service workers after ~30s; the held claim fetch keeps this
// one alive while linked, and this alarm both heartbeats and restarts the
// claim loop after a kill. Alarms have a 30s floor, so 0.5 min it is.
const HEARTBEAT_ALARM_PERIOD_MIN = 0.5;

function armAlarms(): void {
  void chrome.alarms.create(HEARTBEAT_ALARM, {
    periodInMinutes: HEARTBEAT_ALARM_PERIOD_MIN,
  });
}

async function resume(): Promise<void> {
  const state = await getState();
  if (state.linked && !state.paused && !state.relink) {
    startClaimLoop();
  }
}

chrome.runtime.onInstalled.addListener(() => {
  armAlarms();
  void resume();
});

chrome.runtime.onStartup.addListener(() => {
  armAlarms();
  void resume();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== HEARTBEAT_ALARM) {
    return;
  }
  void sendHeartbeat();
  if (!isLoopRunning()) {
    void resume();
  }
});

// Clicking the toolbar icon opens the side panel.
void chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(() => undefined);

watchManagedWindow(() => {
  // In-flight commands notice on their own (tab lookups fail with
  // windowClosed); the heartbeat's window_state tells the server side.
  void sendHeartbeat();
});

// Link handshake, step 2: the engenty settings page (an allowed origin per
// externally_connectable) sends the link payload. It is stored as PENDING
// only — nothing is trusted until the user confirms in the side panel.
chrome.runtime.onMessageExternal.addListener(
  (message, sender, sendResponse) => {
    if (!isBridgeLinkMessage(message)) {
      sendResponse({ error: "unsupported message", ok: false });
      return;
    }
    void (async () => {
      await setPendingLink({
        origin: sender.origin ?? sender.url ?? "unknown origin",
        payload: message,
      });
      // Draw attention to the pending confirmation. sidePanel.open needs a
      // user gesture, which an external message does not carry — the badge is
      // the fallback signal.
      void chrome.action.setBadgeText({ text: "1" });
      sendResponse({ ok: true, status: "pending_confirmation" });
    })();
    return true;
  }
);

async function confirmPendingLink(): Promise<void> {
  const pending = await getPendingLink();
  if (!pending) {
    return;
  }
  const { payload } = pending;
  await patchState({
    allowedOrigins: payload.allowed_origins,
    apiBaseUrl: payload.api_base_url,
    connectionId: payload.connection_id,
    deviceLabel: payload.device_label,
    installationId: payload.installation_id,
    linked: true,
    paused: false,
    relink: false,
    sessionId: payload.session_id,
    token: payload.token,
  });
  await setPendingLink(null);
  void chrome.action.setBadgeText({ text: "" });
  await ensureManagedWindow();
  startClaimLoop();
}

async function grantSiteAccess(): Promise<boolean> {
  const state = await getState();
  const patterns = state.allowedOrigins
    .map((origin) => {
      const withoutWildcard = origin.replace("//*.", "//");
      try {
        const url = new URL(withoutWildcard);
        return origin.includes("//*.")
          ? `${url.protocol}//*.${url.host}/*`
          : `${url.protocol}//${url.host}/*`;
      } catch {
        return null;
      }
    })
    .filter((pattern): pattern is string => pattern !== null);
  if (patterns.length === 0) {
    return false;
  }
  return await chrome.permissions.request({ origins: patterns });
}

// Side-panel controls.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const command = message as PanelCommand;
  void (async () => {
    switch (command.kind) {
      case "panel-confirm-link":
        await confirmPendingLink();
        break;
      case "panel-reject-link":
        await setPendingLink(null);
        void chrome.action.setBadgeText({ text: "" });
        break;
      case "panel-set-paused": {
        await patchState({ paused: command.paused });
        if (!command.paused) {
          startClaimLoop();
        }
        break;
      }
      case "panel-reopen-window":
        await ensureManagedWindow();
        await sendHeartbeat();
        break;
      case "panel-grant-site-access": {
        const granted = await grantSiteAccess();
        sendResponse({ granted, ok: true });
        return;
      }
      case "panel-unlink": {
        await postDisconnect().catch(() => undefined);
        await clearState();
        break;
      }
      default:
        break;
    }
    sendResponse({ ok: true });
  })();
  return true;
});

void resume();
armAlarms();
