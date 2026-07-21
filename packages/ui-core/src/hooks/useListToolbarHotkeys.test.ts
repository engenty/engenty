/** @vitest-environment happy-dom */
import { cleanup, renderHook } from "@testing-library/react";
import type { RefObject } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useListToolbarHotkeys } from "./useListToolbarHotkeys.js";

afterEach(() => {
  cleanup();
});

function dispatchModKey(key: string, init: { shiftKey?: boolean } = {}) {
  window.dispatchEvent(
    new KeyboardEvent("keydown", {
      key,
      metaKey: true,
      shiftKey: init.shiftKey ?? false,
      bubbles: true,
      cancelable: true,
    })
  );
}

describe("useListToolbarHotkeys", () => {
  it("focuses and selects the search input on Mod+F", () => {
    const input = document.createElement("input");
    document.body.append(input);
    const searchInputRef: RefObject<HTMLInputElement | null> = {
      current: input,
    };
    const focus = vi.spyOn(input, "focus");
    const select = vi.spyOn(input, "select");

    renderHook(() => useListToolbarHotkeys({ searchInputRef }));
    dispatchModKey("f");

    expect(focus).toHaveBeenCalled();
    expect(select).toHaveBeenCalled();
    input.remove();
  });

  it("opens filters on Mod+Shift+F", () => {
    const searchInputRef: RefObject<HTMLInputElement | null> = {
      current: null,
    };
    const onOpenFilters = vi.fn();
    renderHook(() => useListToolbarHotkeys({ searchInputRef, onOpenFilters }));
    dispatchModKey("f", { shiftKey: true });
    expect(onOpenFilters).toHaveBeenCalledTimes(1);
  });

  it("does not capture Mod+Shift+F without onOpenFilters", () => {
    const searchInputRef: RefObject<HTMLInputElement | null> = {
      current: null,
    };
    const preventDefault = vi.fn();
    renderHook(() => useListToolbarHotkeys({ searchInputRef }));

    const event = new KeyboardEvent("keydown", {
      key: "f",
      metaKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(event, "preventDefault", { value: preventDefault });
    window.dispatchEvent(event);
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("opens new item on Mod+N", () => {
    const onNewItem = vi.fn();
    renderHook(() => useListToolbarHotkeys({ onNewItem }));
    dispatchModKey("n");
    expect(onNewItem).toHaveBeenCalledTimes(1);
  });

  it("does not capture Mod+N without onNewItem", () => {
    const preventDefault = vi.fn();
    renderHook(() => useListToolbarHotkeys({}));

    const event = new KeyboardEvent("keydown", {
      key: "n",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(event, "preventDefault", { value: preventDefault });
    window.dispatchEvent(event);
    expect(preventDefault).not.toHaveBeenCalled();
  });
});
