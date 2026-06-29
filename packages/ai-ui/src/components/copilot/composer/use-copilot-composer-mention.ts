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
  useMemo,
  useRef,
  useState,
} from "react";
import {
  getMentionQueryAtCursor,
  stripLeadingMentionToken,
} from "./copilot-agent-mention";
import { getTextareaCaretViewportRect } from "./textarea-caret-viewport-rect";

export function useCopilotComposerMention(input: {
  compact: boolean;
  mentionAgentCandidates?: Array<{ handle: string; id: string; name: string }>;
  onComposerMentionAgent?: (agentId: string) => void;
  setDraft: (value: string | ((prev: string) => string)) => void;
}) {
  const mentionOverrideRef = useRef<string | null>(null);
  const mentionAnchorRef = useRef<{ at: number; caret: number }>({
    at: 0,
    caret: 0,
  });
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionHighlight, setMentionHighlight] = useState(0);
  const [mentionRows, setMentionRows] = useState<
    Array<{ handle: string; id: string; name: string }>
  >([]);
  const [mentionLayoutEpoch, setMentionLayoutEpoch] = useState(0);
  const mentionComposerWrapRef = useRef<HTMLDivElement | null>(null);
  const mentionFloatRef = useRef<HTMLDivElement | null>(null);

  const mentionCandidates = input.mentionAgentCandidates ?? [];
  const mentionPickIds = useMemo(
    () => new Set(mentionCandidates.map((c) => c.id)),
    [mentionCandidates]
  );

  const updateMentionUi = useCallback(
    (value: string, caret: number) => {
      if (mentionCandidates.length === 0) {
        setMentionOpen(false);
        setMentionRows([]);
        return;
      }
      const m = getMentionQueryAtCursor(value, caret);
      if (!m) {
        setMentionOpen(false);
        setMentionRows([]);
        return;
      }
      const q = m.query.toLowerCase();
      const filtered = mentionCandidates.filter(
        (c) =>
          c.handle.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
      );
      if (filtered.length === 0) {
        setMentionOpen(false);
        setMentionRows([]);
        return;
      }
      mentionAnchorRef.current = { at: m.atIndex, caret };
      setMentionHighlight(0);
      setMentionRows(filtered);
      setMentionOpen(true);
    },
    [mentionCandidates]
  );

  const applyMentionPick = useCallback(
    (agent: { handle: string; id: string; name: string }) => {
      const { at, caret } = mentionAnchorRef.current;
      input.setDraft((prev) => {
        const before = prev.slice(0, at);
        const after = prev.slice(caret);
        return `${before}@${agent.handle} ${after}`;
      });
      mentionOverrideRef.current = agent.id;
      input.onComposerMentionAgent?.(agent.id);
      setMentionOpen(false);
    },
    [input.onComposerMentionAgent, input.setDraft]
  );

  const handleDraftControlledChange = useCallback(
    (value: string, caret: number) => {
      input.setDraft(value);
      if (input.compact && mentionCandidates.length > 0) {
        updateMentionUi(value, caret);
      }
    },
    [input.compact, input.setDraft, mentionCandidates.length, updateMentionUi]
  );

  const handleMentionKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (!mentionOpen || mentionRows.length === 0) {
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionOpen(false);
        setMentionRows([]);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionHighlight((i) => Math.min(mentionRows.length - 1, i + 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionHighlight((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const row = mentionRows[mentionHighlight];
        if (row) {
          applyMentionPick(row);
        }
      }
    },
    [applyMentionPick, mentionHighlight, mentionOpen, mentionRows]
  );

  useLayoutEffect(() => {
    if (!(input.compact && mentionOpen) || mentionRows.length === 0) {
      return;
    }
    const wrap = mentionComposerWrapRef.current;
    const floatEl = mentionFloatRef.current;
    const ta = wrap?.querySelector("textarea");
    if (!(wrap && floatEl && ta)) {
      return;
    }
    const caretPos = mentionAnchorRef.current.caret;
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
  }, [
    input.compact,
    mentionHighlight,
    mentionLayoutEpoch,
    mentionOpen,
    mentionRows,
  ]);

  useEffect(() => {
    if (!(input.compact && mentionOpen) || mentionRows.length === 0) {
      return;
    }
    const ta = mentionComposerWrapRef.current?.querySelector("textarea");
    if (!ta) {
      return;
    }
    const bump = () => {
      setMentionLayoutEpoch((n) => n + 1);
    };
    ta.addEventListener("scroll", bump, { passive: true });
    return () => {
      ta.removeEventListener("scroll", bump);
    };
  }, [input.compact, mentionOpen, mentionRows.length]);

  useEffect(() => {
    if (!(input.compact && mentionOpen) || mentionRows.length === 0) {
      return;
    }
    const root = mentionFloatRef.current;
    if (!root) {
      return;
    }
    requestAnimationFrame(() => {
      const items = root.querySelectorAll<HTMLElement>("[cmdk-item]");
      items[mentionHighlight]?.scrollIntoView({ block: "nearest" });
    });
  }, [
    input.compact,
    mentionHighlight,
    mentionLayoutEpoch,
    mentionOpen,
    mentionRows,
  ]);

  const resolveSubmitAgentOverride = useCallback(
    (text: string) => {
      const pick = mentionOverrideRef.current;
      mentionOverrideRef.current = null;
      const stripped = stripLeadingMentionToken(text, mentionCandidates);
      let requestedAgentId = stripped.requestedAgentId;
      if (pick && mentionPickIds.has(pick)) {
        requestedAgentId = pick;
      }
      return { text: stripped.text, requestedAgentId };
    },
    [mentionCandidates, mentionPickIds]
  );

  const clearMentionOnSubmit = useCallback(() => {
    setMentionOpen(false);
  }, []);

  return {
    applyMentionPick,
    clearMentionOnSubmit,
    handleDraftControlledChange,
    handleMentionKeyDown,
    mentionComposerWrapRef,
    mentionFloatRef,
    mentionHighlight,
    mentionOpen,
    mentionRows,
    resolveSubmitAgentOverride,
    setMentionHighlight,
    updateMentionUi,
  };
}
