import { useCallback, useEffect, useState } from "react";
import type {
  ActivityEvent,
  BridgeState,
  PendingLink,
} from "../background/state.js";
import type { PanelCommand } from "../shared/messages.js";

/**
 * The side panel is a mirror and a kill-switch: it shows what the bridge is
 * doing (status, activity feed) and lets the user pause, reopen the managed
 * window, or unlink. No chat input — chat lives in engenty.
 */

const STATE_KEY = "bridgeState";
const PENDING_LINK_KEY = "pendingLink";
const ACTIVITY_KEY = "activity";

function sendCommand(command: PanelCommand): Promise<unknown> {
  return chrome.runtime.sendMessage(command);
}

function useBridgeData() {
  const [state, setState] = useState<BridgeState | null>(null);
  const [pending, setPending] = useState<PendingLink | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);

  const refresh = useCallback(async () => {
    const local = await chrome.storage.local.get(STATE_KEY);
    setState((local[STATE_KEY] as BridgeState | undefined) ?? null);
    const session = await chrome.storage.session.get([
      PENDING_LINK_KEY,
      ACTIVITY_KEY,
    ]);
    setPending((session[PENDING_LINK_KEY] as PendingLink | undefined) ?? null);
    setActivity((session[ACTIVITY_KEY] as ActivityEvent[] | undefined) ?? []);
  }, []);

  useEffect(() => {
    void refresh();
    const onChanged = () => void refresh();
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, [refresh]);

  return { activity, pending, refresh, state };
}

function statusOf(state: BridgeState | null): {
  className: string;
  label: string;
} {
  if (!state?.linked) {
    return { className: "dot dot-idle", label: "Not linked" };
  }
  if (state.relink) {
    return { className: "dot dot-error", label: "Re-link needed" };
  }
  if (state.paused) {
    return { className: "dot dot-warn", label: "Paused" };
  }
  return { className: "dot dot-ok", label: "Linked" };
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function ConfirmLinkCard(props: { pending: PendingLink }) {
  const { pending } = props;
  return (
    <div className="card confirm">
      <h2>Link this browser?</h2>
      <p>
        <strong>{hostOf(pending.origin)}</strong> wants to link this extension
        to an engenty agent session. Agents will be able to drive a dedicated
        browser window (navigate and observe freely; click and fill only with
        your approval in engenty).
      </p>
      <p className="muted">
        Device: {pending.payload.device_label}
        <br />
        API: {hostOf(pending.payload.api_base_url)}
      </p>
      <div className="row">
        <button
          className="primary"
          onClick={() => void sendCommand({ kind: "panel-confirm-link" })}
          type="button"
        >
          Link
        </button>
        <button
          onClick={() => void sendCommand({ kind: "panel-reject-link" })}
          type="button"
        >
          Reject
        </button>
      </div>
    </div>
  );
}

function ActivityRow(props: { event: ActivityEvent }) {
  const { event } = props;
  const icon =
    event.status === "running" ? "…" : event.status === "ok" ? "✓" : "✕";
  return (
    <li className={`activity ${event.status}`}>
      <span className="activity-icon">{icon}</span>
      <span className="activity-verb">{event.action}</span>
      <span className="activity-target" title={event.error ?? event.detail}>
        {event.detail}
      </span>
      {event.durationMs !== undefined && (
        <span className="activity-duration">
          {(event.durationMs / 1000).toFixed(1)}s
        </span>
      )}
    </li>
  );
}

export function App() {
  const { activity, pending, state } = useBridgeData();
  const status = statusOf(state);

  const grantAccess = async () => {
    // chrome.permissions.request needs a user gesture, so it runs here in the
    // panel (an extension page), not in the service worker.
    const origins = (state?.allowedOrigins ?? [])
      .map((origin) => {
        try {
          const url = new URL(origin.replace("//*.", "//"));
          return origin.includes("//*.")
            ? `${url.protocol}//*.${url.host}/*`
            : `${url.protocol}//${url.host}/*`;
        } catch {
          return null;
        }
      })
      .filter((pattern): pattern is string => pattern !== null);
    if (origins.length > 0) {
      await chrome.permissions.request({ origins });
    }
  };

  return (
    <div className="panel">
      <header>
        <span className={status.className} />
        <div className="header-text">
          <span className="header-title">engenty</span>
          <span className="header-subtitle">
            {state?.linked ? state.deviceLabel : status.label}
          </span>
        </div>
      </header>

      <main>
        {pending && <ConfirmLinkCard pending={pending} />}

        {!(pending || state?.linked) && (
          <div className="card">
            <h2>Not linked</h2>
            <p className="muted">
              Open engenty → Settings → Browser bridge and link this extension.
              Nothing happens without an explicit link.
            </p>
          </div>
        )}

        {state?.relink && (
          <div className="card confirm">
            <h2>Session expired</h2>
            <p className="muted">
              The link token expired. Open engenty → Settings → Browser bridge
              and link again.
            </p>
          </div>
        )}

        {state?.linked && (
          <>
            <div className="card">
              <div className="kv">
                <span className="muted">Status</span>
                <span>{status.label}</span>
              </div>
              <div className="kv">
                <span className="muted">API</span>
                <span>{hostOf(state.apiBaseUrl)}</span>
              </div>
              <div className="kv">
                <span className="muted">Allowed origins</span>
                <span>{state.allowedOrigins.length}</span>
              </div>
              <button
                className="link"
                onClick={() => void grantAccess()}
                type="button"
              >
                Grant site access for allowed origins
              </button>
            </div>

            <section className="feed">
              <h2>Activity</h2>
              {activity.length === 0 ? (
                <p className="muted">No commands yet.</p>
              ) : (
                <ul>
                  {activity.map((event) => (
                    <ActivityRow event={event} key={event.id} />
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>

      {state?.linked && (
        <footer>
          <button
            onClick={() =>
              void sendCommand({
                kind: "panel-set-paused",
                paused: !state.paused,
              })
            }
            type="button"
          >
            {state.paused ? "Resume" : "Pause"}
          </button>
          <button
            onClick={() => void sendCommand({ kind: "panel-reopen-window" })}
            type="button"
          >
            Reopen window
          </button>
          <button
            className="danger"
            onClick={() => void sendCommand({ kind: "panel-unlink" })}
            type="button"
          >
            Unlink
          </button>
        </footer>
      )}
    </div>
  );
}
