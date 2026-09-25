/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it } from "vitest";
import {
  INTERACTION_WINDOW_KEY,
  installInteractionDiagnostics,
} from "./interaction-diagnostics";

describe("installInteractionDiagnostics", () => {
  afterEach(() => {
    delete (window as Window & { [INTERACTION_WINDOW_KEY]?: unknown })[
      INTERACTION_WINDOW_KEY
    ];
  });

  it("records URL update and paint after begin + history.pushState", async () => {
    let now = 100;
    const handle = installInteractionDiagnostics({
      isProd: false,
      now: () => now,
      telemetry: null,
    });
    const api = (
      window as Window & {
        [INTERACTION_WINDOW_KEY]?: {
          begin: (name: string) => void;
          end: () => {
            firstPaintMs: number | null;
            mode: string;
            responseMs: number | null;
          } | null;
        };
      }
    )[INTERACTION_WINDOW_KEY];
    expect(api).toBeDefined();
    api?.begin("space-switch");
    now = 140;
    window.history.pushState({}, "", "/s/other");
    now = 165;
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    const record = api?.end();
    expect(record?.mode).toBe("development");
    expect(record?.responseMs).toBe(40);
    expect(record?.firstPaintMs).toBeGreaterThanOrEqual(40);
    handle.dispose();
  });

  it("labels production mode separately", () => {
    const handle = installInteractionDiagnostics({
      isProd: true,
      telemetry: null,
    });
    const api = (
      window as Window & {
        [INTERACTION_WINDOW_KEY]?: {
          begin: (name: string) => void;
          end: () => { mode: string } | null;
        };
      }
    )[INTERACTION_WINDOW_KEY];
    api?.begin("module-nav");
    window.history.replaceState({}, "", "/mdl/tasks");
    expect(api?.end()?.mode).toBe("production");
    handle.dispose();
  });
});
