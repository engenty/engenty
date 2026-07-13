/** @vitest-environment happy-dom */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  activateArtifact,
  clearArtifactsForTests,
  closeArtifact,
  type EngentyArtifact,
  openArtifact,
  seedPlaceholderArtifacts,
  setArtifactPaneOpen,
  useArtifacts,
} from "./artifact-store";

const HOST = "test-host";

function artifact(id: string, title = id): EngentyArtifact {
  return { id, title, type: "placeholder" };
}

describe("artifact store", () => {
  beforeEach(() => {
    clearArtifactsForTests(HOST);
  });

  it("opens an artifact, activates it, and reveals the pane", () => {
    const { result } = renderHook(() => useArtifacts(HOST));
    expect(result.current.paneOpen).toBe(false);

    act(() => openArtifact(HOST, artifact("a")));
    expect(result.current.artifacts.map((a) => a.id)).toEqual(["a"]);
    expect(result.current.activeId).toBe("a");
    expect(result.current.paneOpen).toBe(true);
  });

  it("re-opening an existing artifact activates without duplicating", () => {
    const { result } = renderHook(() => useArtifacts(HOST));
    act(() => {
      openArtifact(HOST, artifact("a"));
      openArtifact(HOST, artifact("b"));
      openArtifact(HOST, artifact("a"));
    });
    expect(result.current.artifacts.map((a) => a.id)).toEqual(["a", "b"]);
    expect(result.current.activeId).toBe("a");
  });

  it("closing the active tab activates its neighbor", () => {
    const { result } = renderHook(() => useArtifacts(HOST));
    act(() => {
      openArtifact(HOST, artifact("a"));
      openArtifact(HOST, artifact("b"));
      openArtifact(HOST, artifact("c"));
      activateArtifact(HOST, "b");
      closeArtifact(HOST, "b");
    });
    expect(result.current.artifacts.map((a) => a.id)).toEqual(["a", "c"]);
    expect(result.current.activeId).toBe("c");
  });

  it("closing the last tab closes the pane", () => {
    const { result } = renderHook(() => useArtifacts(HOST));
    act(() => {
      openArtifact(HOST, artifact("a"));
      closeArtifact(HOST, "a");
    });
    expect(result.current.artifacts).toEqual([]);
    expect(result.current.activeId).toBeNull();
    expect(result.current.paneOpen).toBe(false);
  });

  it("closing an inactive tab keeps the active one", () => {
    const { result } = renderHook(() => useArtifacts(HOST));
    act(() => {
      openArtifact(HOST, artifact("a"));
      openArtifact(HOST, artifact("b"));
      closeArtifact(HOST, "a");
    });
    expect(result.current.activeId).toBe("b");
  });

  it("seed activates the first artifact without opening the pane, and is a no-op when tabs exist", () => {
    const { result } = renderHook(() => useArtifacts(HOST));
    act(() => seedPlaceholderArtifacts(HOST, [artifact("s1"), artifact("s2")]));
    expect(result.current.artifacts.map((a) => a.id)).toEqual(["s1", "s2"]);
    expect(result.current.activeId).toBe("s1");
    expect(result.current.paneOpen).toBe(false);

    act(() => seedPlaceholderArtifacts(HOST, [artifact("s3")]));
    expect(result.current.artifacts.map((a) => a.id)).toEqual(["s1", "s2"]);
  });

  it("toggling the pane keeps tabs", () => {
    const { result } = renderHook(() => useArtifacts(HOST));
    act(() => {
      openArtifact(HOST, artifact("a"));
      setArtifactPaneOpen(HOST, false);
    });
    expect(result.current.paneOpen).toBe(false);
    expect(result.current.artifacts).toHaveLength(1);
    act(() => result.current.togglePane());
    expect(result.current.paneOpen).toBe(true);
  });
});
