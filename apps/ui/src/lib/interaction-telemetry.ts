import { uiEnvString } from "./env";
import {
  looksLikeUserContent,
  routeGroupFromPath,
} from "./interaction-route-group";
import type { CompletedInteraction } from "./interaction-timing";

export type InteractionTelemetryName =
  | "api"
  | "inp"
  | "interaction"
  | "longtask"
  | "route"
  | "startup";

/**
 * Sampled browser telemetry. Fields are release / route group / device class
 * / duration only — never record ids or user content.
 */
export interface InteractionTelemetryEvent {
  deviceClass: "desktop" | "phone" | "tablet";
  durationMs?: number;
  mode: "development" | "production";
  name: InteractionTelemetryName;
  release: string;
  routeGroup: string;
  startupBytes?: number;
}

export interface InteractionTelemetrySink {
  send: (event: InteractionTelemetryEvent) => void;
}

export function isPerformanceTelemetryEnabled(
  flag = uiEnvString("VITE_UI_PERFORMANCE_TELEMETRY")
): boolean {
  const value = flag.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

export function shouldSampleTelemetry(
  sampleRate: number,
  random: number
): boolean {
  if (sampleRate <= 0) {
    return false;
  }
  if (sampleRate >= 1) {
    return true;
  }
  return random < sampleRate;
}

export function sanitizeTelemetryEvent(
  event: InteractionTelemetryEvent
): InteractionTelemetryEvent | null {
  const routeGroup = routeGroupFromPath(event.routeGroup);
  if (
    looksLikeUserContent(routeGroup) ||
    looksLikeUserContent(event.release) ||
    looksLikeUserContent(event.name)
  ) {
    return null;
  }
  return {
    deviceClass: event.deviceClass,
    mode: event.mode,
    name: event.name,
    release: event.release,
    routeGroup,
    ...(event.durationMs === undefined
      ? {}
      : { durationMs: Math.round(event.durationMs) }),
    ...(event.startupBytes === undefined
      ? {}
      : { startupBytes: Math.round(event.startupBytes) }),
  };
}

export function telemetryEventFromInteraction(
  record: CompletedInteraction,
  meta: {
    deviceClass: InteractionTelemetryEvent["deviceClass"];
    release: string;
    routeGroup: string;
  }
): InteractionTelemetryEvent | null {
  const durationMs = record.responseMs ?? record.firstPaintMs;
  if (durationMs === null) {
    return null;
  }
  return sanitizeTelemetryEvent({
    deviceClass: meta.deviceClass,
    durationMs,
    mode: record.mode,
    name: "interaction",
    release: meta.release,
    routeGroup: meta.routeGroup,
  });
}

export function createBeaconTelemetrySink(input: {
  fetchImpl?: typeof fetch;
  url: string;
}): InteractionTelemetrySink | null {
  const url = input.url.trim();
  if (!url) {
    return null;
  }
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  return {
    send(event) {
      const body = JSON.stringify(event);
      const blob = new Blob([body], { type: "application/json" });
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        navigator.sendBeacon(url, blob);
        return;
      }
      void fetchImpl(url, {
        body,
        headers: { "content-type": "application/json" },
        keepalive: true,
        method: "POST",
      });
    },
  };
}
