/** @vitest-environment happy-dom */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearThreadContextUiForTests,
  setThreadContextMode,
  setThreadContextOverlayOpen,
  useThreadContextUi,
} from "./thread-context-store.js";

describe("thread context ui store", () => {
  beforeEach(() => {
    clearThreadContextUiForTests();
  });

  it("starts hidden with overlay closed", () => {
    const { result } = renderHook(() => useThreadContextUi());
    expect(result.current.mode).toBe("hidden");
    expect(result.current.overlayOpen).toBe(false);
  });

  it("exposes collapsed mode for the topbar toggle", () => {
    const { result } = renderHook(() => useThreadContextUi());
    act(() => setThreadContextMode("collapsed"));
    expect(result.current.mode).toBe("collapsed");
  });

  it("closes overlay when leaving collapsed mode", () => {
    const { result } = renderHook(() => useThreadContextUi());
    act(() => {
      setThreadContextMode("collapsed");
      setThreadContextOverlayOpen(true);
    });
    expect(result.current.overlayOpen).toBe(true);
    act(() => setThreadContextMode("inline"));
    expect(result.current.mode).toBe("inline");
    expect(result.current.overlayOpen).toBe(false);
  });
});
