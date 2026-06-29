/**
 * @vitest-environment happy-dom
 */

import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SlashCommandItem } from "../extensions/slash-commands.js";
import {
  SlashCommandList,
  type SlashCommandListRef,
} from "./slash-command-list.jsx";

const items: SlashCommandItem[] = [
  {
    title: "Alpha",
    description: "First",
    icon: "A",
    onSelect: () => {},
  },
  {
    title: "Beta",
    description: "Second",
    icon: "B",
    onSelect: () => {},
  },
];

describe("SlashCommandList", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    root.unmount();
    container.remove();
  });

  it("returns false for Escape so the suggestion plugin can exit", () => {
    const ref = createRef<SlashCommandListRef>();
    const command = vi.fn();

    act(() => {
      root.render(
        <SlashCommandList command={command} items={items} ref={ref} />
      );
    });

    const handled = ref.current?.onKeyDown({
      event: new KeyboardEvent("keydown", { key: "Escape" }),
      view: {} as never,
      range: { from: 0, to: 1 },
    });

    expect(handled).toBe(false);
  });

  it("selects the next item with ArrowDown and confirms with Enter", () => {
    const ref = createRef<SlashCommandListRef>();
    const command = vi.fn();

    act(() => {
      root.render(
        <SlashCommandList command={command} items={items} ref={ref} />
      );
    });

    const key = (k: string) =>
      ref.current?.onKeyDown({
        event: new KeyboardEvent("keydown", { key: k }),
        view: {} as never,
        range: { from: 0, to: 1 },
      });

    act(() => {
      expect(key("ArrowDown")).toBe(true);
    });
    act(() => {
      expect(key("Enter")).toBe(true);
    });

    expect(command).toHaveBeenCalledTimes(1);
    expect(command).toHaveBeenCalledWith(items[1]);
  });

  it("confirms with Tab like Enter on the first item", () => {
    const ref = createRef<SlashCommandListRef>();
    const command = vi.fn();

    act(() => {
      root.render(
        <SlashCommandList command={command} items={items} ref={ref} />
      );
    });

    act(() => {
      ref.current?.onKeyDown({
        event: new KeyboardEvent("keydown", { key: "Tab" }),
        view: {} as never,
        range: { from: 0, to: 1 },
      });
    });

    expect(command).toHaveBeenCalledWith(items[0]);
  });
});
