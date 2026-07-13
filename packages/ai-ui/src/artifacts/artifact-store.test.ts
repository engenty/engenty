/** @vitest-environment happy-dom */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  activateArtifact,
  clearArtifactsForTests,
  setArtifactPaneExpanded,
  setArtifactPaneOpen,
  useArtifactListSync,
  useArtifacts,
} from "./artifact-store";

const HOST = "test-host";

describe("artifact pane state", () => {
  beforeEach(() => {
    clearArtifactsForTests(HOST);
  });

  it("activate reveals the pane and sets the active tab", () => {
    const { result } = renderHook(() => useArtifacts(HOST));
    expect(result.current.paneOpen).toBe(false);

    act(() => activateArtifact(HOST, "a1"));
    expect(result.current.activeId).toBe("a1");
    expect(result.current.paneOpen).toBe(true);
  });

  it("closing the pane clears the expanded state", () => {
    const { result } = renderHook(() => useArtifacts(HOST));
    act(() => {
      setArtifactPaneOpen(HOST, true);
      setArtifactPaneExpanded(HOST, true);
    });
    expect(result.current.paneExpanded).toBe(true);

    act(() => setArtifactPaneOpen(HOST, false));
    expect(result.current.paneOpen).toBe(false);
    expect(result.current.paneExpanded).toBe(false);
  });
});

describe("artifact list sync", () => {
  beforeEach(() => {
    clearArtifactsForTests(HOST);
  });

  it("does not auto-open the pane for artifacts present on first load", () => {
    const { result } = renderHook(
      ({ ids }: { ids: string[] }) => {
        useArtifactListSync({
          hostKey: HOST,
          threadId: "t1",
          ids,
          isReady: true,
        });
        return useArtifacts(HOST);
      },
      { initialProps: { ids: ["a1", "a2"] } }
    );
    expect(result.current.paneOpen).toBe(false);
    expect(result.current.activeId).toBeNull();
  });

  it("auto-opens and activates an artifact that appears after the first load", () => {
    const { result, rerender } = renderHook(
      ({ ids }: { ids: string[] }) => {
        useArtifactListSync({
          hostKey: HOST,
          threadId: "t1",
          ids,
          isReady: true,
        });
        return useArtifacts(HOST);
      },
      { initialProps: { ids: ["a1"] } }
    );
    expect(result.current.paneOpen).toBe(false);

    act(() => rerender({ ids: ["a2", "a1"] }));
    expect(result.current.activeId).toBe("a2");
    expect(result.current.paneOpen).toBe(true);
  });

  it("reconciles the active tab when its artifact leaves the list", () => {
    const { result, rerender } = renderHook(
      ({ ids }: { ids: string[] }) => {
        useArtifactListSync({
          hostKey: HOST,
          threadId: "t1",
          ids,
          isReady: true,
        });
        return useArtifacts(HOST);
      },
      { initialProps: { ids: ["a1", "a2"] } }
    );
    act(() => activateArtifact(HOST, "a2"));
    expect(result.current.activeId).toBe("a2");

    act(() => rerender({ ids: ["a1"] }));
    expect(result.current.activeId).toBe("a1");
  });
});
