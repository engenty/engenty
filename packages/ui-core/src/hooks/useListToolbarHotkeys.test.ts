/** @vitest-environment happy-dom */
import { HotkeyManager } from "@tanstack/react-hotkeys";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { RefObject } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LIST_TOOLBAR_HOTKEYS,
  useListToolbarHotkeys,
} from "./useListToolbarHotkeys.js";

afterEach(() => {
  cleanup();
});

function isMacPlatform(): boolean {
  return (
    typeof navigator !== "undefined" &&
    /mac/i.test(navigator.platform || navigator.userAgent)
  );
}

function dispatchModKey(
  key: string,
  init: { shiftKey?: boolean; target?: EventTarget } = {}
) {
  const isMac = isMacPlatform();
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    ctrlKey: !isMac,
    key,
    metaKey: isMac,
    shiftKey: init.shiftKey ?? false,
  });
  (init.target ?? document).dispatchEvent(event);
  return event;
}

describe("useListToolbarHotkeys", () => {
  beforeEach(() => {
    HotkeyManager.resetInstance();
  });

  afterEach(() => {
    HotkeyManager.resetInstance();
    document.body.innerHTML = "";
  });

  it("focuses and selects the search input on Mod+F", () => {
    const input = document.createElement("input");
    document.body.append(input);
    const searchInputRef: RefObject<HTMLInputElement | null> = {
      current: input,
    };
    const focus = vi.spyOn(input, "focus");
    const select = vi.spyOn(input, "select");

    renderHook(() => useListToolbarHotkeys({ searchInputRef }));
    act(() => {
      dispatchModKey("f");
    });

    expect(focus).toHaveBeenCalled();
    expect(select).toHaveBeenCalled();
  });

  it("opens filters on Mod+Shift+F", () => {
    const searchInputRef: RefObject<HTMLInputElement | null> = {
      current: null,
    };
    const onOpenFilters = vi.fn();
    renderHook(() => useListToolbarHotkeys({ searchInputRef, onOpenFilters }));
    act(() => {
      dispatchModKey("f", { shiftKey: true });
    });
    expect(onOpenFilters).toHaveBeenCalledTimes(1);
  });

  it("does not capture Mod+Shift+F without onOpenFilters", () => {
    const searchInputRef: RefObject<HTMLInputElement | null> = {
      current: null,
    };
    const preventDefault = vi.fn();
    renderHook(() => useListToolbarHotkeys({ searchInputRef }));

    const isMac = isMacPlatform();
    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      ctrlKey: !isMac,
      key: "f",
      metaKey: isMac,
      shiftKey: true,
    });
    Object.defineProperty(event, "preventDefault", { value: preventDefault });
    document.dispatchEvent(event);
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("opens new item on Mod+N", () => {
    const onNewItem = vi.fn();
    renderHook(() => useListToolbarHotkeys({ onNewItem }));
    act(() => {
      dispatchModKey("n");
    });
    expect(onNewItem).toHaveBeenCalledTimes(1);
  });

  it("does not capture Mod+N without onNewItem", () => {
    const preventDefault = vi.fn();
    renderHook(() => useListToolbarHotkeys({}));

    const isMac = isMacPlatform();
    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      ctrlKey: !isMac,
      key: "n",
      metaKey: isMac,
    });
    Object.defineProperty(event, "preventDefault", { value: preventDefault });
    document.dispatchEvent(event);
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("ignores list shortcuts while focus is inside a dialog", () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    const field = document.createElement("input");
    dialog.append(field);
    document.body.append(dialog);
    const onNewItem = vi.fn();
    renderHook(() => useListToolbarHotkeys({ onNewItem }));
    act(() => {
      dispatchModKey("n", { target: field });
    });
    expect(onNewItem).not.toHaveBeenCalled();
  });

  it("registers list chords with Lists group metadata", () => {
    const onNewItem = vi.fn();
    const searchInputRef: RefObject<HTMLInputElement | null> = {
      current: null,
    };
    renderHook(() =>
      useListToolbarHotkeys({
        onNewItem,
        onOpenFilters: vi.fn(),
        searchInputRef,
      })
    );
    const registrations = [
      ...HotkeyManager.getInstance().registrations.state.values(),
    ];
    const byHotkey = new Map(
      registrations.map((entry) => [entry.hotkey, entry])
    );
    expect(byHotkey.get(LIST_TOOLBAR_HOTKEYS.search)?.options.meta?.group).toBe(
      "Lists"
    );
    expect(byHotkey.get(LIST_TOOLBAR_HOTKEYS.filters)?.options.meta?.name).toBe(
      "Open list filters"
    );
    expect(byHotkey.get(LIST_TOOLBAR_HOTKEYS.newItem)?.options.meta?.name).toBe(
      "New item"
    );
  });
});
