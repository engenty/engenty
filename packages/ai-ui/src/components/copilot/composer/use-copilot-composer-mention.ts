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
import type { ChatReferenceItem } from "../../../lib/chat-reference-part";
import {
  getMentionQueryAtCursor,
  stripLeadingMentionToken,
} from "./copilot-agent-mention";
import { getTextareaCaretViewportRect } from "./textarea-caret-viewport-rect";

/** A non-agent @-mention candidate (user, contact, object, artifact, file). */
export interface MentionRefCandidate {
  /** Entity key for chip rendering, e.g. "contacts:contact" | "core:user" | "artifact". */
  entity: string;
  /** Section heading in the picker (localized by the supplier), e.g. "People". */
  group: string;
  label: string;
  /** Canonical ObjectRef emitted on pick. */
  ref: string;
  sublabel?: string;
}

/** Searches non-agent mention candidates as the user types (debounced by the hook). */
export type MentionRefSearch = (
  query: string
) => Promise<MentionRefCandidate[]>;

export type MentionRow =
  | { agent: { handle: string; id: string; name: string }; kind: "agent" }
  | { candidate: MentionRefCandidate; kind: "ref" };

export function mentionRowKey(row: MentionRow): string {
  return row.kind === "agent"
    ? `agent:${row.agent.id}`
    : `ref:${row.candidate.ref}`;
}

const MENTION_SEARCH_DEBOUNCE_MS = 150;

export function useCopilotComposerMention(input: {
  compact: boolean;
  mentionAgentCandidates?: Array<{ handle: string; id: string; name: string }>;
  /** Async search over users/contacts/objects/artifacts. Enables typed mentions. */
  mentionRefSearch?: MentionRefSearch;
  onComposerMentionAgent?: (agentId: string) => void;
  /** A non-agent candidate was picked — the host attaches it as a reference chip. */
  onComposerMentionRef?: (candidate: MentionRefCandidate) => void;
  setDraft: (value: string | ((prev: string) => string)) => void;
}) {
  const mentionOverrideRef = useRef<string | null>(null);
  const mentionAnchorRef = useRef<{ at: number; caret: number }>({
    at: 0,
    caret: 0,
  });
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionHighlight, setMentionHighlight] = useState(0);
  const [mentionRows, setMentionRows] = useState<MentionRow[]>([]);
  const [mentionLayoutEpoch, setMentionLayoutEpoch] = useState(0);
  const mentionComposerWrapRef = useRef<HTMLDivElement | null>(null);
  const mentionFloatRef = useRef<HTMLDivElement | null>(null);
  const searchEpochRef = useRef(0);
  const searchTimerRef = useRef<number | null>(null);
  const activeQueryRef = useRef<string | null>(null);

  const mentionCandidates = input.mentionAgentCandidates ?? [];
  const mentionPickIds = useMemo(
    () => new Set(mentionCandidates.map((c) => c.id)),
    [mentionCandidates]
  );
  const mentionEnabled =
    mentionCandidates.length > 0 || Boolean(input.mentionRefSearch);

  const filterAgentRows = useCallback(
    (query: string): MentionRow[] => {
      const q = query.toLowerCase();
      return mentionCandidates
        .filter(
          (c) =>
            c.handle.toLowerCase().includes(q) ||
            c.name.toLowerCase().includes(q)
        )
        .map((agent) => ({ agent, kind: "agent" as const }));
    },
    [mentionCandidates]
  );

  const closeMention = useCallback(() => {
    activeQueryRef.current = null;
    if (searchTimerRef.current !== null) {
      window.clearTimeout(searchTimerRef.current);
      searchTimerRef.current = null;
    }
    setMentionOpen(false);
    setMentionRows([]);
  }, []);

  const updateMentionUi = useCallback(
    (value: string, caret: number) => {
      if (!mentionEnabled) {
        closeMention();
        return;
      }
      const m = getMentionQueryAtCursor(value, caret);
      if (!m) {
        closeMention();
        return;
      }
      mentionAnchorRef.current = { at: m.atIndex, caret };
      const agentRows = filterAgentRows(m.query);
      activeQueryRef.current = m.query;

      // Agent rows render synchronously; ref sections stream in after the
      // debounce. Keep the menu open on agent hits even before search lands.
      if (agentRows.length > 0 || input.mentionRefSearch) {
        setMentionHighlight(0);
        setMentionRows(agentRows);
        setMentionOpen(agentRows.length > 0);
      } else {
        closeMention();
        return;
      }

      const search = input.mentionRefSearch;
      if (!search) {
        return;
      }
      const epoch = ++searchEpochRef.current;
      const query = m.query;
      if (searchTimerRef.current !== null) {
        window.clearTimeout(searchTimerRef.current);
      }
      searchTimerRef.current = window.setTimeout(() => {
        searchTimerRef.current = null;
        void search(query)
          .then((candidates) => {
            if (
              epoch !== searchEpochRef.current ||
              activeQueryRef.current !== query
            ) {
              return;
            }
            const refRows: MentionRow[] = candidates.map((candidate) => ({
              candidate,
              kind: "ref" as const,
            }));
            const rows = [...filterAgentRows(query), ...refRows];
            if (rows.length === 0) {
              setMentionOpen(false);
              setMentionRows([]);
              return;
            }
            setMentionHighlight((i) => Math.min(i, rows.length - 1));
            setMentionRows(rows);
            setMentionOpen(true);
          })
          .catch(() => {
            // Search failure keeps whatever rows are showing.
          });
      }, MENTION_SEARCH_DEBOUNCE_MS);
    },
    [closeMention, filterAgentRows, input.mentionRefSearch, mentionEnabled]
  );

  const applyMentionPick = useCallback(
    (row: MentionRow) => {
      const { at, caret } = mentionAnchorRef.current;
      const token =
        row.kind === "agent"
          ? `@${row.agent.handle} `
          : `@${row.candidate.label} `;
      input.setDraft((prev) => {
        const before = prev.slice(0, at);
        const after = prev.slice(caret);
        return `${before}${token}${after}`;
      });
      if (row.kind === "agent") {
        mentionOverrideRef.current = row.agent.id;
        input.onComposerMentionAgent?.(row.agent.id);
      } else {
        input.onComposerMentionRef?.(row.candidate);
      }
      closeMention();
    },
    [
      closeMention,
      input.onComposerMentionAgent,
      input.onComposerMentionRef,
      input.setDraft,
    ]
  );

  const handleDraftControlledChange = useCallback(
    (value: string, caret: number) => {
      input.setDraft(value);
      if (input.compact && mentionEnabled) {
        updateMentionUi(value, caret);
      }
    },
    [input.compact, input.setDraft, mentionEnabled, updateMentionUi]
  );

  const handleMentionKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (!mentionOpen || mentionRows.length === 0) {
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        closeMention();
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
    [applyMentionPick, closeMention, mentionHighlight, mentionOpen, mentionRows]
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
    closeMention();
  }, [closeMention]);

  return {
    applyMentionPick,
    clearMentionOnSubmit,
    handleDraftControlledChange,
    handleMentionKeyDown,
    mentionComposerWrapRef,
    mentionEnabled,
    mentionFloatRef,
    mentionHighlight,
    mentionOpen,
    mentionRows,
    resolveSubmitAgentOverride,
    setMentionHighlight,
    updateMentionUi,
  };
}

/** Chip model for a picked reference (composer-held, submitted as `refs`). */
export type PendingMentionRef = ChatReferenceItem;
