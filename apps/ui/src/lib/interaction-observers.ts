import {
  deviceClassFromWidth,
  routeGroupFromPath,
} from "./interaction-route-group";
import type { InteractionTelemetryEvent } from "./interaction-telemetry";
import type { InteractionMode, InteractionSession } from "./interaction-timing";

type HostWindow = Window & typeof globalThis;

function observe(
  _host: HostWindow,
  type: string,
  handler: PerformanceObserverCallback
): () => void {
  if (typeof PerformanceObserver === "undefined") {
    return () => {};
  }
  try {
    const observer = new PerformanceObserver(handler);
    observer.observe({ buffered: true, type });
    return () => observer.disconnect();
  } catch {
    return () => {};
  }
}

export function installPerformanceObservers(input: {
  emit: (event: InteractionTelemetryEvent) => void;
  host: HostWindow;
  mode: InteractionMode;
  release: string;
  session: InteractionSession;
}): () => void {
  const { emit, host, mode, release, session } = input;
  const routeGroup = () => routeGroupFromPath(host.location.pathname);
  const deviceClass = () => deviceClassFromWidth(host.innerWidth);
  const stoppers = [
    observe(host, "longtask", (list) => {
      for (const entry of list.getEntries()) {
        session.markLongTask({
          duration: entry.duration,
          startTime: entry.startTime,
        });
        emit({
          deviceClass: deviceClass(),
          durationMs: entry.duration,
          mode,
          name: "longtask",
          release,
          routeGroup: routeGroup(),
        });
      }
    }),
    observe(host, "resource", (list) => {
      for (const entry of list.getEntries()) {
        const resource = entry as PerformanceResourceTiming;
        if (
          resource.initiatorType !== "fetch" &&
          resource.initiatorType !== "xmlhttprequest"
        ) {
          continue;
        }
        session.markApi(resource.duration);
        emit({
          deviceClass: deviceClass(),
          durationMs: resource.duration,
          mode,
          name: "api",
          release,
          routeGroup: routeGroup(),
        });
      }
    }),
    observe(host, "event", (list) => {
      for (const entry of list.getEntries()) {
        const timing = entry as PerformanceEventTiming;
        if (!timing.interactionId) {
          continue;
        }
        emit({
          deviceClass: deviceClass(),
          durationMs: timing.duration,
          mode,
          name: "inp",
          release,
          routeGroup: routeGroup(),
        });
      }
    }),
  ];

  const onLoad = () => {
    const resources = host.performance.getEntriesByType(
      "resource"
    ) as PerformanceResourceTiming[];
    const startupBytes = resources.reduce(
      (sum, entry) => sum + (entry.transferSize || 0),
      0
    );
    emit({
      deviceClass: deviceClass(),
      mode,
      name: "startup",
      release,
      routeGroup: routeGroup(),
      startupBytes,
    });
  };
  if (host.document.readyState === "complete") {
    onLoad();
  } else {
    host.addEventListener("load", onLoad, { once: true });
    stoppers.push(() => host.removeEventListener("load", onLoad));
  }

  return () => {
    for (const stop of stoppers) {
      stop();
    }
  };
}
