import { uiEnvString } from "./env";
import { installPerformanceObservers } from "./interaction-observers";
import {
  deviceClassFromWidth,
  routeGroupFromPath,
} from "./interaction-route-group";
import {
  createBeaconTelemetrySink,
  type InteractionTelemetrySink,
  isPerformanceTelemetryEnabled,
  sanitizeTelemetryEvent,
  shouldSampleTelemetry,
  telemetryEventFromInteraction,
} from "./interaction-telemetry";
import {
  type CompletedInteraction,
  createInteractionSession,
  type InteractionMode,
} from "./interaction-timing";

export const INTERACTION_WINDOW_KEY = "__ENGENTY_INTERACTION__";

export interface InteractionWindowApi {
  begin: (name: string) => void;
  end: () => CompletedInteraction | null;
  records: CompletedInteraction[];
}

type HostWindow = Window &
  typeof globalThis & {
    [INTERACTION_WINDOW_KEY]?: InteractionWindowApi;
  };

export interface InteractionDiagnosticsHandle {
  dispose: () => void;
  session: ReturnType<typeof createInteractionSession>;
}

function defaultTelemetrySink(): InteractionTelemetrySink | null {
  if (!isPerformanceTelemetryEnabled()) {
    return null;
  }
  return createBeaconTelemetrySink({
    url: uiEnvString("VITE_UI_PERFORMANCE_TELEMETRY_URL"),
  });
}

/**
 * Browser instrumentation for route intent, URL update, first destination
 * paint, API completion, and long tasks. Always records onto
 * `window.__ENGENTY_INTERACTION__` for Playwright. Sampled telemetry send
 * is off unless `VITE_UI_PERFORMANCE_TELEMETRY` is set.
 */
export function installInteractionDiagnostics(input?: {
  isProd?: boolean;
  now?: () => number;
  sampleRate?: number;
  telemetry?: InteractionTelemetrySink | null;
  window?: HostWindow;
}): InteractionDiagnosticsHandle {
  const host = input?.window ?? (window as HostWindow);
  const mode: InteractionMode =
    (input?.isProd ?? Boolean(import.meta.env.PROD))
      ? "production"
      : "development";
  const session = createInteractionSession({
    mode,
    now: input?.now ?? (() => host.performance.now()),
  });
  const telemetry =
    input && "telemetry" in input ? input.telemetry : defaultTelemetrySink();
  const sampleRate = input?.sampleRate ?? 0.1;
  const release = uiEnvString("VITE_APP_VERSION", "dev");
  const stoppers: Array<() => void> = [];

  const emit = (
    event: NonNullable<ReturnType<typeof sanitizeTelemetryEvent>>
  ) => {
    if (!(telemetry && shouldSampleTelemetry(sampleRate, Math.random()))) {
      return;
    }
    const sanitized = sanitizeTelemetryEvent(event);
    if (sanitized) {
      telemetry.send(sanitized);
    }
  };

  const onUrl = () => {
    session.markUrl();
    host.requestAnimationFrame(() => {
      host.requestAnimationFrame(() => session.markPaint());
    });
  };

  const pushState = host.history.pushState.bind(host.history);
  const replaceState = host.history.replaceState.bind(host.history);
  host.history.pushState = (...args) => {
    pushState(...args);
    onUrl();
  };
  host.history.replaceState = (...args) => {
    replaceState(...args);
    onUrl();
  };
  host.addEventListener("popstate", onUrl);
  stoppers.push(() => {
    host.history.pushState = pushState;
    host.history.replaceState = replaceState;
    host.removeEventListener("popstate", onUrl);
  });

  const onPointer = (event: Event) => {
    if (session.isActive()) {
      return;
    }
    const target = event.target;
    if (target instanceof Element && target.closest("a[href]")) {
      session.begin("route");
    }
  };
  host.addEventListener("pointerdown", onPointer, true);
  stoppers.push(() => host.removeEventListener("pointerdown", onPointer, true));
  stoppers.push(
    installPerformanceObservers({ emit, host, mode, release, session })
  );

  const api: InteractionWindowApi = {
    begin: (name) => session.begin(name),
    end: () => {
      const record = session.end();
      if (record) {
        const event = telemetryEventFromInteraction(record, {
          deviceClass: deviceClassFromWidth(host.innerWidth),
          release,
          routeGroup: routeGroupFromPath(host.location.pathname),
        });
        if (event) {
          emit({ ...event, name: "route" });
          emit(event);
        }
      }
      return record;
    },
    get records() {
      return session.records;
    },
  };
  host[INTERACTION_WINDOW_KEY] = api;

  return {
    session,
    dispose() {
      for (const stop of stoppers) {
        stop();
      }
      if (host[INTERACTION_WINDOW_KEY] === api) {
        delete host[INTERACTION_WINDOW_KEY];
      }
    },
  };
}
