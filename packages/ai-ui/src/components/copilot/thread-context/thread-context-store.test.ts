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

  // A popover left open while inline would pop up again on the next collapse.
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
