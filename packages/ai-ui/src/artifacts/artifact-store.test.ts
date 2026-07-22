/** @vitest-environment happy-dom */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  activateArtifact,
  clearArtifactsForTests,
  closeObjectPaneTab,
  objectPaneTabKey,
  openObjectPaneTab,
  setActiveArtifact,
  setArtifactPaneExpanded,
  setArtifactPaneOpen,
  useArtifactListSync,
  useArtifacts,
} from "./artifact-store";

const HOST = "test-host";
const CONTACT_REF = { module: "contacts", entity: "contact", id: "c1" };
const CONTACT_KEY = objectPaneTabKey(CONTACT_REF);

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
          scopeKey: "t1",
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

  it("marks fresh artifacts unseen while the pane is closed (no auto-open)", () => {
    const { result, rerender } = renderHook(
      ({ ids }: { ids: string[] }) => {
        useArtifactListSync({
          hostKey: HOST,
          scopeKey: "t1",
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
    expect(result.current.paneOpen).toBe(false);
    expect(result.current.unseenCount).toBe(1);
    expect(result.current.unseenIds).toEqual(["a2"]);
  });

  it("activates fresh artifacts when the pane is already open", () => {
    const { result, rerender } = renderHook(
      ({ ids }: { ids: string[] }) => {
        useArtifactListSync({
          hostKey: HOST,
          scopeKey: "t1",
          ids,
          isReady: true,
        });
        return useArtifacts(HOST);
      },
      { initialProps: { ids: ["a1"] } }
    );
    act(() => setArtifactPaneOpen(HOST, true));
    act(() => setActiveArtifact(HOST, "a1"));

    act(() => rerender({ ids: ["a2", "a1"] }));
    expect(result.current.activeId).toBe("a2");
    expect(result.current.paneOpen).toBe(true);
    expect(result.current.unseenCount).toBe(0);
  });

  it("clears unseen when the pane opens", () => {
    const { result, rerender } = renderHook(
      ({ ids }: { ids: string[] }) => {
        useArtifactListSync({
          hostKey: HOST,
          scopeKey: "t1",
          ids,
          isReady: true,
        });
        return useArtifacts(HOST);
      },
      { initialProps: { ids: [] } }
    );
    act(() => rerender({ ids: ["a1"] }));
    expect(result.current.unseenCount).toBe(1);

    act(() => setArtifactPaneOpen(HOST, true));
    expect(result.current.unseenCount).toBe(0);
  });

  it("reconciles the active tab when its artifact leaves the list", () => {
    const { result, rerender } = renderHook(
      ({ ids }: { ids: string[] }) => {
        useArtifactListSync({
          hostKey: HOST,
          scopeKey: "t1",
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

  it("closing (archiving) the last tab closes the pane", () => {
    const { result, rerender } = renderHook(
      ({ ids }: { ids: string[] }) => {
        useArtifactListSync({
          hostKey: HOST,
          scopeKey: "t1",
          ids,
          isReady: true,
        });
        return useArtifacts(HOST);
      },
      { initialProps: { ids: ["a1"] } }
    );
    act(() => activateArtifact(HOST, "a1"));
    expect(result.current.paneOpen).toBe(true);

    act(() => rerender({ ids: [] }));
    expect(result.current.paneOpen).toBe(false);
    expect(result.current.activeId).toBeNull();
  });
});

describe("object pane tabs", () => {
  beforeEach(() => {
    clearArtifactsForTests(HOST);
  });

  it("opens, dedupes, and activates an object tab", () => {
    const { result } = renderHook(() => useArtifacts(HOST));
    act(() => openObjectPaneTab(HOST, CONTACT_REF, { title: "ACME" }));
    expect(result.current.paneOpen).toBe(true);
    expect(result.current.activeId).toBe(CONTACT_KEY);
    expect(result.current.objectTabs).toEqual([
      { key: CONTACT_KEY, ref: CONTACT_REF, title: "ACME" },
    ]);

    act(() => openObjectPaneTab(HOST, CONTACT_REF, { title: "ACME GmbH" }));
    expect(result.current.objectTabs).toHaveLength(1);
    expect(result.current.objectTabs[0].title).toBe("ACME GmbH");
  });

  it("expanded hint grows the pane", () => {
    const { result } = renderHook(() => useArtifacts(HOST));
    act(() => openObjectPaneTab(HOST, CONTACT_REF, { expanded: true }));
    expect(result.current.paneExpanded).toBe(true);
  });

  it("closing the active object tab falls back to an artifact, then closes", () => {
    const { result } = renderHook(() => useArtifacts(HOST));
    act(() => openObjectPaneTab(HOST, CONTACT_REF));
    act(() => closeObjectPaneTab(HOST, CONTACT_KEY, ["a1"]));
    expect(result.current.activeId).toBe("a1");
    expect(result.current.paneOpen).toBe(true);

    act(() => openObjectPaneTab(HOST, CONTACT_REF));
    act(() => closeObjectPaneTab(HOST, CONTACT_KEY, []));
    expect(result.current.paneOpen).toBe(false);
    expect(result.current.activeId).toBeNull();
  });

  it("list sync neither steals object-tab focus nor closes the pane over them", () => {
    const { result, rerender } = renderHook(
      ({ ids }: { ids: string[] }) => {
        useArtifactListSync({
          hostKey: HOST,
          scopeKey: "t1",
          ids,
          isReady: true,
        });
        return useArtifacts(HOST);
      },
      { initialProps: { ids: ["a1"] } }
    );
    act(() => openObjectPaneTab(HOST, CONTACT_REF));
    expect(result.current.activeId).toBe(CONTACT_KEY);

    // Artifact list churn must not steal focus from the object tab...
    act(() => rerender({ ids: [] }));
    expect(result.current.activeId).toBe(CONTACT_KEY);
    // ...and the emptied artifact list must not close the pane.
    expect(result.current.paneOpen).toBe(true);
  });
});
