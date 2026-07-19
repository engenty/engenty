"use client";

import {
  autoUpdate,
  computePosition,
  flip,
  offset,
  shift,
} from "@floating-ui/dom";
import type { KeyboardEvent } from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  type ChatSlashCommand,
  filterSlashCommands,
  getSlashQueryAtCursor,
} from "./copilot-slash-command";
import { getTextareaCaretViewportRect } from "./textarea-caret-viewport-rect";

/**
 * Slash-command typeahead for the compact composer. Mirrors
 * `useCopilotComposerMention`: caret-anchored floating menu, external keyboard
 * highlight, pick splices the canonical token into the draft.
 */
export function useCopilotComposerSlash(input: {
  compact: boolean;
  setDraft: (value: string | ((prev: string) => string)) => void;
  slashCommands?: ChatSlashCommand[];
}) {
  const slashAnchorRef = useRef<{ caret: number }>({ caret: 0 });
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashHighlight, setSlashHighlight] = useState(0);
  const [slashRows, setSlashRows] = useState<ChatSlashCommand[]>([]);
  const [slashLayoutEpoch, setSlashLayoutEpoch] = useState(0);
  const slashComposerWrapRef = useRef<HTMLDivElement | null>(null);
  const slashFloatRef = useRef<HTMLDivElement | null>(null);

  const slashCommands = input.slashCommands ?? [];

  const updateSlashUi = useCallback(
    (value: string, caret: number) => {
      if (slashCommands.length === 0) {
        setSlashOpen(false);
        setSlashRows([]);
        return;
      }
      const m = getSlashQueryAtCursor(value, caret);
      if (!m) {
        setSlashOpen(false);
        setSlashRows([]);
        return;
      }
      const filtered = filterSlashCommands(slashCommands, m.query);
      if (filtered.length === 0) {
        setSlashOpen(false);
        setSlashRows([]);
        return;
      }
      slashAnchorRef.current = { caret };
      setSlashHighlight(0);
      setSlashRows(filtered);
      setSlashOpen(true);
    },
    [slashCommands]
  );

  const applySlashPick = useCallback(
    (command: ChatSlashCommand) => {
      // The token is message-leading by construction: replace everything from
      // the "/" up to the caret with the canonical command + a space.
      const { caret } = slashAnchorRef.current;
      input.setDraft((prev) => {
        const after = prev.slice(caret);
        return `/${command.command} ${after.trimStart()}`;
      });
      setSlashOpen(false);
    },
    [input.setDraft]
  );

  /** Open the menu in browse mode (used by the `/help` built-in). */
  const openSlashBrowse = useCallback(() => {
    if (slashCommands.length === 0) {
      return;
    }
    input.setDraft("/");
    slashAnchorRef.current = { caret: 1 };
    setSlashHighlight(0);
    setSlashRows([...slashCommands]);
    setSlashOpen(true);
  }, [input.setDraft, slashCommands]);

  const handleSlashKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (!slashOpen || slashRows.length === 0) {
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSlashOpen(false);
        setSlashRows([]);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashHighlight((i) => Math.min(slashRows.length - 1, i + 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashHighlight((i) => Math.max(0, i - 1));
        return;
      }
      if ((e.key === "Enter" && !e.shiftKey) || e.key === "Tab") {
        e.preventDefault();
        const row = slashRows[slashHighlight];
        if (row) {
          applySlashPick(row);
        }
      }
    },
    [applySlashPick, slashHighlight, slashOpen, slashRows]
  );

  useLayoutEffect(() => {
    if (!(input.compact && slashOpen) || slashRows.length === 0) {
      return;
    }
    const wrap = slashComposerWrapRef.current;
    const floatEl = slashFloatRef.current;
    const ta = wrap?.querySelector("textarea");
    if (!(wrap && floatEl && ta)) {
      return;
    }
    const caretPos = slashAnchorRef.current.caret;
    const virtualRef = {
      contextElement: ta,
      getBoundingClientRect: () => getTextareaCaretViewportRect(ta, caretPos),
    };
    const run = () => {
      void computePosition(virtualRef, floatEl, {
        middleware: [
          offset(4),
          flip({
            fallbackPlacements: ["top-start", "bottom-start"],
            padding: 8,
          }),
          shift({ padding: 8 }),
        ],
        placement: "bottom-start",
      }).then(({ strategy, x, y }) => {
        Object.assign(floatEl.style, {
          left: `${x}px`,
          position: strategy,
          top: `${y}px`,
          visibility: "visible",
        });
      });
    };
    floatEl.style.visibility = "hidden";
    run();
    return autoUpdate(virtualRef, floatEl, run, {
      animationFrame: true,
    });
  }, [input.compact, slashHighlight, slashLayoutEpoch, slashOpen, slashRows]);

  useEffect(() => {
    if (!(input.compact && slashOpen) || slashRows.length === 0) {
      return;
    }
    const ta = slashComposerWrapRef.current?.querySelector("textarea");
    if (!ta) {
      return;
    }
    const bump = () => {
      setSlashLayoutEpoch((n) => n + 1);
    };
    ta.addEventListener("scroll", bump, { passive: true });
    return () => {
      ta.removeEventListener("scroll", bump);
    };
  }, [input.compact, slashOpen, slashRows.length]);

  useEffect(() => {
    if (!(input.compact && slashOpen) || slashRows.length === 0) {
      return;
    }
    const root = slashFloatRef.current;
    if (!root) {
      return;
    }
    requestAnimationFrame(() => {
      const items = root.querySelectorAll<HTMLElement>("[cmdk-item]");
      items[slashHighlight]?.scrollIntoView({ block: "nearest" });
    });
  }, [input.compact, slashHighlight, slashLayoutEpoch, slashOpen, slashRows]);

  const clearSlashOnSubmit = useCallback(() => {
    setSlashOpen(false);
  }, []);

  return {
    applySlashPick,
    clearSlashOnSubmit,
    handleSlashKeyDown,
    openSlashBrowse,
    setSlashHighlight,
    slashComposerWrapRef,
    slashFloatRef,
    slashHighlight,
    slashOpen,
    slashRows,
    updateSlashUi,
  };
}
