/**
 * Slash Command Popup — React component for the TipTap slash commands menu.
 *
 * Renders as a floating panel near the cursor when the user types "/".
 * Uses @tiptap/suggestion's rendering API.
 */

import type {
  SuggestionKeyDownProps,
  SuggestionProps,
} from "@tiptap/suggestion";
import type { Ref } from "react";
import { useEffect, useImperativeHandle, useRef, useState } from "react";
import type { SlashCommandItem } from "../extensions/slash-commands.js";

export interface SlashCommandListRef {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

export interface SlashCommandListProps {
  command: SuggestionProps["command"];
  items: SlashCommandItem[];
}

export function SlashCommandList({
  items,
  command,
  ref,
}: SlashCommandListProps & { ref?: Ref<SlashCommandListRef | null> }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  // Scroll selected item into view
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const el = container.children[selectedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: SuggestionKeyDownProps) => {
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((i) => (i <= 0 ? items.length - 1 : i - 1));
        return true;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((i) => (i >= items.length - 1 ? 0 : i + 1));
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        if (items[selectedIndex]) {
          command(items[selectedIndex]);
        }
        return true;
      }
      if (event.key === "Escape") {
        return false;
      }
      return false;
    },
  }));

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="slash-command-menu" ref={containerRef}>
      {items.map((item, index) => (
        <button
          className={`slash-command-item ${index === selectedIndex ? "is-selected" : ""}`}
          key={item.title}
          onClick={() => command(item)}
          onMouseDown={(e) => e.preventDefault()}
          onMouseEnter={() => setSelectedIndex(index)}
          onPointerDown={(e) => e.preventDefault()}
          type="button"
        >
          <span className="slash-command-icon">{item.icon}</span>
          <span className="slash-command-text">
            <span className="slash-command-title">{item.title}</span>
            <span className="slash-command-desc">{item.description}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
