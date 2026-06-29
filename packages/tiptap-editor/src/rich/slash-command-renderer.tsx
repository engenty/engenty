/**
 * TipTap suggestion `render` factory: React slash menu + Floating UI positioning.
 */

import { autoUpdate, computePosition, flip, shift } from "@floating-ui/dom";
import { ReactRenderer } from "@tiptap/react";
import type {
  SuggestionKeyDownProps,
  SuggestionProps,
} from "@tiptap/suggestion";
import type { SlashCommandItem } from "../extensions/slash-commands.js";
import {
  SlashCommandList,
  type SlashCommandListRef,
} from "./slash-command-list.jsx";

export function createSlashSuggestionRenderer() {
  return () => {
    let renderer: ReactRenderer<SlashCommandListRef> | null = null;
    let stopAutoUpdate: (() => void) | undefined;
    let getClientRect: (() => DOMRect | null) | null = null;

    function updatePosition() {
      if (!renderer) {
        return;
      }
      const el = renderer.element;
      const rect = getClientRect?.();
      if (!rect) {
        return;
      }
      const virtualRef = {
        getBoundingClientRect: () => rect,
      };
      void computePosition(virtualRef, el, {
        placement: "bottom-start",
        middleware: [flip(), shift({ padding: 8 })],
      }).then(({ x, y, strategy }) => {
        Object.assign(el.style, {
          position: strategy,
          left: `${x}px`,
          top: `${y}px`,
        });
      });
    }

    return {
      onStart: (props: SuggestionProps<SlashCommandItem, SlashCommandItem>) => {
        getClientRect = props.clientRect ?? null;

        renderer = new ReactRenderer(SlashCommandList, {
          editor: props.editor,
          props: {
            items: props.items,
            command: props.command,
          },
        });

        const el = renderer.element;
        el.style.zIndex = "9999";
        document.body.appendChild(el);

        const virtualRef = {
          getBoundingClientRect: () =>
            getClientRect?.() ?? new DOMRect(0, 0, 0, 0),
        };
        stopAutoUpdate = autoUpdate(virtualRef, el, updatePosition);
        updatePosition();
      },

      onUpdate: (
        props: SuggestionProps<SlashCommandItem, SlashCommandItem>
      ) => {
        getClientRect = props.clientRect ?? null;
        renderer?.updateProps({
          items: props.items,
          command: props.command,
        });
        updatePosition();
      },

      onKeyDown: (keyDownProps: SuggestionKeyDownProps) => {
        if (keyDownProps.event.key === "Escape") {
          return false;
        }
        return renderer?.ref?.onKeyDown(keyDownProps) ?? false;
      },

      onExit: () => {
        stopAutoUpdate?.();
        stopAutoUpdate = undefined;
        renderer?.destroy();
        renderer = null;
        getClientRect = null;
      },
    };
  };
}
