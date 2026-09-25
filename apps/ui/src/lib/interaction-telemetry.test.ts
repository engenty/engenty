import { describe, expect, it, vi } from "vitest";
import {
  createBeaconTelemetrySink,
  isPerformanceTelemetryEnabled,
  sanitizeTelemetryEvent,
  shouldSampleTelemetry,
  telemetryEventFromInteraction,
} from "./interaction-telemetry";
import type { CompletedInteraction } from "./interaction-timing";

describe("isPerformanceTelemetryEnabled", () => {
  it("no-ops unless the flag is on", () => {
    expect(isPerformanceTelemetryEnabled("")).toBe(false);
    expect(isPerformanceTelemetryEnabled("0")).toBe(false);
    expect(isPerformanceTelemetryEnabled("1")).toBe(true);
    expect(isPerformanceTelemetryEnabled("true")).toBe(true);
  });
});

describe("shouldSampleTelemetry", () => {
  it("honours a 0–1 sample rate", () => {
    expect(shouldSampleTelemetry(0, 0)).toBe(false);
    expect(shouldSampleTelemetry(1, 0.99)).toBe(true);
    expect(shouldSampleTelemetry(0.1, 0.09)).toBe(true);
    expect(shouldSampleTelemetry(0.1, 0.1)).toBe(false);
  });
});

describe("sanitizeTelemetryEvent", () => {
  it("drops events that still carry ids or user content", () => {
    expect(
      sanitizeTelemetryEvent({
        deviceClass: "desktop",
        durationMs: 40,
        mode: "production",
        name: "interaction",
        release: "0.2.16",
        routeGroup: "/s/company/tasks/3fa85f64-5717-4562-b3fc-2c963f66afa6",
      })
    ).toEqual({
      deviceClass: "desktop",
      durationMs: 40,
      mode: "production",
      name: "interaction",
      release: "0.2.16",
      routeGroup: "/s/:space/tasks/:id",
    });
    expect(
      sanitizeTelemetryEvent({
        deviceClass: "phone",
        mode: "development",
        name: "inp",
        release: "user@host",
        routeGroup: "/mdl/tasks",
      })
    ).toBeNull();
  });
});

describe("telemetryEventFromInteraction", () => {
  it("emits duration without the interaction name payload leaking content", () => {
    const record: CompletedInteraction = {
      apiCompleteMs: 80,
      apiCount: 2,
      firstPaintMs: 70,
      longTaskMaxMs: 18,
      longTasks: [],
      mode: "development",
      name: "space-switch",
      responseMs: 40,
      starvedByReactExpiration: false,
    };
    expect(
      telemetryEventFromInteraction(record, {
        deviceClass: "desktop",
        release: "0.2.16",
        routeGroup: "/s/engenty/work",
      })
    ).toEqual({
      deviceClass: "desktop",
      durationMs: 40,
      mode: "development",
      name: "interaction",
      release: "0.2.16",
      routeGroup: "/s/:space/work",
    });
  });
});

describe("createBeaconTelemetrySink", () => {
  it("returns null without a URL so the helper no-ops", () => {
    expect(createBeaconTelemetrySink({ url: "  " })).toBeNull();
  });

  it("POSTs JSON when sendBeacon is missing", () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    const beacon = navigator.sendBeacon;
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      value: undefined,
    });
    try {
      const sink = createBeaconTelemetrySink({
        fetchImpl: fetchImpl as unknown as typeof fetch,
        url: "https://example.test/ui-perf",
      });
      sink?.send({
        deviceClass: "tablet",
        durationMs: 12,
        mode: "production",
        name: "longtask",
        release: "0.2.16",
        routeGroup: "/mdl/tasks",
      });
      expect(fetchImpl).toHaveBeenCalledWith(
        "https://example.test/ui-perf",
        expect.objectContaining({
          keepalive: true,
          method: "POST",
        })
      );
    } finally {
      Object.defineProperty(navigator, "sendBeacon", {
        configurable: true,
        value: beacon,
      });
    }
  });
});
