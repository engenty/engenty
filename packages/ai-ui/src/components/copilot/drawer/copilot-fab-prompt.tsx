"use client";

import type { AppBarPosition } from "@engenty/app-shell";
import { Button } from "@engenty/ui-core";
import { ArrowUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { COPILOT_Z_SNAP_HINT } from "./copilot-drawer-constants";
import {
  computePromptAnchor,
  PROMPT_INPUT_HEIGHT,
  PROMPT_INPUT_WIDTH,
} from "./copilot-fab-dial";

/**
 * One line, floating beside the blob: the fastest way to START a chat without
 * first deciding where it should live.
 *
 * It is deliberately NOT a chat surface. It takes a first message and hands it
 * to whichever surface the page calls for (`resolveCopilotNewChatPlan`), which
 * is why it closes on submit rather than growing a transcript — a box that
 * turned into a panel in place would be a fourth copilot surface, hovering
 * over the page, with no header, position menu or history.
 */
export function CopilotFabPrompt({
  anchorRef,
  barSelector = '[data-engenty-region="app-bar"]',
  docked,
  onOpenChange,
  onSubmit,
  open,
  placeholder = "Ask Copilot…",
  position,
}: {
  anchorRef: { current: HTMLElement | null };
  /** App-bar box the input must clear, not just the blob. */
  barSelector?: string;
  docked: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (text: string) => void;
  open: boolean;
  placeholder?: string;
  position: AppBarPosition;
}) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setText("");
      return;
    }
    // After the portal paints, or the caret lands nowhere.
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onOpenChange, open]);

  if (!(open && typeof document !== "undefined")) {
    return null;
  }

  const fab = anchorRef.current?.getBoundingClientRect();
  if (!fab) {
    return null;
  }
  const bar = docked
    ? (anchorRef.current?.closest(barSelector)?.getBoundingClientRect() ?? null)
    : null;
  const anchor = computePromptAnchor({
    bar,
    dock: docked ? position : null,
    fab,
    viewport: { height: window.innerHeight, width: window.innerWidth },
  });

  const submit = () => {
    const value = text.trim();
    if (!value) {
      return;
    }
    onOpenChange(false);
    onSubmit(value);
  };

  return createPortal(
    <>
      {/* Click-away. Transparent: the page stays readable while you type into
          a box about it. */}
      <button
        aria-label="Dismiss"
        className="fixed inset-0 cursor-default"
        onClick={() => onOpenChange(false)}
        style={{ zIndex: COPILOT_Z_SNAP_HINT + 6 }}
        type="button"
      />
      <div
        className="fixed flex items-center gap-1.5 rounded-full border border-border-soft bg-card pr-1.5 pl-4 shadow-lg"
        style={{
          height: PROMPT_INPUT_HEIGHT,
          left: anchor.left,
          top: anchor.top,
          width: PROMPT_INPUT_WIDTH,
          zIndex: COPILOT_Z_SNAP_HINT + 7,
        }}
      >
        <input
          className="min-w-0 flex-1 bg-transparent text-sm outline-hidden placeholder:text-muted-foreground"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          ref={inputRef}
          type="text"
          value={text}
        />
        <Button
          aria-label="Send"
          className="size-8 shrink-0 rounded-full"
          disabled={text.trim().length === 0}
          onClick={submit}
          size="icon"
          type="button"
        >
          <ArrowUp className="size-4" />
        </Button>
      </div>
    </>,
    document.body,
    "copilot-fab-prompt"
  );
}
