// One pass over the transcript's rows: everything a row needs from the rows
// around it — bubble clusters, the sender name, the gap above it, date and
// memory lines — so a row renders from its own descriptor alone.

import type { AgentTurnMessageLike } from "@engenty/ag-ui-bridge";
import { cn } from "@engenty/ui-core";
import {
  type ChatRowKind,
  chatBubbleCluster,
  chatRowGapClassName,
  chatSpeakerKey,
} from "./chat-user-bubble.js";
import {
  type ChatBubbleBreaks,
  chatBubbleBreaks,
} from "./copilot-message-content";
import { needsDateDivider } from "./transcript-date-divider.js";

export type TranscriptMessage = AgentTurnMessageLike & { id: string };

interface TranscriptRowBase {
  meetsAbove: boolean;
  meetsBelow: boolean;
  /** Spacing and stacking classes for the row's outer element. */
  stackClassName: string | undefined;
}

export interface TranscriptMessageRowLayout extends TranscriptRowBase {
  /** Class of the date line above the row; undefined = no date line. */
  dateDividerClassName: string | undefined;
  kind: "message";
  /** Class of the memory line above the row; undefined = no memory line. */
  memoryDividerClassName: string | undefined;
  raw: TranscriptMessage;
  /** The name opens a speaker's turn on its first bubble with words. */
  showSenderLabel: boolean;
}

export interface TranscriptPendingRowLayout extends TranscriptRowBase {
  kind: "pending";
}

export type TranscriptRowLayout =
  | TranscriptMessageRowLayout
  | TranscriptPendingRowLayout;

type RowEdges = { bottom: ChatRowKind; top: ChatRowKind } | null;

const PENDING_BREAKS: ChatBubbleBreaks = {
  above: false,
  below: false,
  words: true,
};

// What a row shows at its top and bottom edge. A turn that opens with clips
// starts as a line of clips, whatever follows; one with a card under its
// words ends as one. A row that shows nothing — a turn of only silent tools —
// has no edges and takes no gap.
function rowEdgesOf(breaks: ChatBubbleBreaks, pending: boolean): RowEdges {
  if (pending) {
    return { bottom: "bubble", top: "bubble" };
  }
  if (!breaks.words) {
    return breaks.above ? { bottom: "line", top: "line" } : null;
  }
  return {
    bottom: breaks.below ? "line" : "bubble",
    top: breaks.above ? "line" : "bubble",
  };
}

export function layoutTranscriptRows(input: {
  /** Row index (among `messages`) the memory line sits above; null = none. */
  memoryBreakIndex: number | null;
  messages: readonly TranscriptMessage[];
  pendingInsertIndex: number;
  showPending: boolean;
  surface: "default" | "chat";
  toolDetail: "developer" | "person";
}): TranscriptRowLayout[] {
  const { memoryBreakIndex, messages, showPending, surface, toolDetail } =
    input;
  const pendingAt = showPending ? input.pendingInsertIndex : -1;
  const rows: (
    | { kind: "pending" }
    | { kind: "message"; filteredIndex: number; raw: TranscriptMessage }
  )[] = [];
  messages.forEach((raw, filteredIndex) => {
    if (filteredIndex === pendingAt) {
      rows.push({ kind: "pending" });
    }
    rows.push({ filteredIndex, kind: "message", raw });
  });
  if (showPending && pendingAt >= messages.length) {
    rows.push({ kind: "pending" });
  }

  const count = rows.length;
  const breaks = rows.map((row) =>
    row.kind === "pending"
      ? PENDING_BREAKS
      : chatBubbleBreaks(row.raw, toolDetail)
  );
  const speakerKeys = rows.map((row) =>
    row.kind === "pending" ? "user" : chatSpeakerKey(row.raw)
  );

  // Where bubbles part: a memory line, a clip or card between two rows, a
  // date line.
  const barriers = new Set<number>();
  const dateDividers = new Set<number>();
  let previousMessage: TranscriptMessage | null = null;
  rows.forEach((row, index) => {
    if (row.kind !== "message") {
      return;
    }
    if (row.filteredIndex === memoryBreakIndex) {
      barriers.add(index);
    }
    const rowBreaks = breaks[index] ?? PENDING_BREAKS;
    if (rowBreaks.above) {
      barriers.add(index);
    }
    if (rowBreaks.below) {
      barriers.add(index + 1);
    }
    if (
      previousMessage &&
      needsDateDivider(previousMessage.createdAt, row.raw.createdAt)
    ) {
      barriers.add(index);
      dateDividers.add(index);
    }
    previousMessage = row.raw;
  });

  // Bubbles join across a row that shows nothing (a turn of only silent
  // tools): clusters are counted over the rows drawn, then mapped back.
  const shownIndices: number[] = [];
  const shownPosition = new Array<number>(count).fill(-1);
  rows.forEach((row, index) => {
    const rowBreaks = breaks[index] ?? PENDING_BREAKS;
    if (row.kind === "pending" || rowBreaks.words || rowBreaks.above) {
      shownPosition[index] = shownIndices.length;
      shownIndices.push(index);
    }
  });
  // For each row index, the position of the first shown row at or after it.
  const nextShown = new Array<number>(count + 1).fill(-1);
  for (let index = count - 1; index >= 0; index--) {
    const position = shownPosition[index] ?? -1;
    nextShown[index] = position >= 0 ? position : (nextShown[index + 1] ?? -1);
  }
  const shownBarriers = new Set(
    [...barriers].map((barrier) => nextShown[barrier] ?? -1)
  );
  const shownClusters = chatBubbleCluster(
    shownIndices.map((index) => speakerKeys[index] ?? ""),
    shownBarriers
  );

  const layout: TranscriptRowLayout[] = [];
  let lastBubbleSpeaker: string | null = null;
  let previousShown = -1;
  let previousEdges: RowEdges = null;
  rows.forEach((row, index) => {
    const rowBreaks = breaks[index] ?? PENDING_BREAKS;
    const speaker = speakerKeys[index] ?? null;
    const cluster = shownClusters[shownPosition[index] ?? -1] ?? {
      meetsAbove: false,
      meetsBelow: false,
    };
    const isBubble = row.kind === "pending" || rowBreaks.words;
    const showSenderLabel = isBubble && speaker !== lastBubbleSpeaker;
    if (isBubble) {
      lastBubbleSpeaker = speaker;
    }
    const edges = rowEdgesOf(rowBreaks, row.kind === "pending");
    const sameSpeaker =
      (previousShown === -1 ? null : speakerKeys[previousShown]) === speaker;
    // One rule spaces every row, the dividers included: each gap follows
    // from this row and the one drawn before it.
    const gapAfter = (previous: ChatRowKind | null, current: ChatRowKind) =>
      surface === "chat"
        ? (chatRowGapClassName(previous, current, {
            joined: cluster.meetsAbove,
            sameSpeaker,
          }) ?? undefined)
        : undefined;
    let previousKind: ChatRowKind | null = previousEdges?.bottom ?? null;
    let memoryDividerClassName: string | undefined;
    let dateDividerClassName: string | undefined;
    let hasMemoryDivider = false;
    let hasDateDivider = false;
    if (row.kind === "message") {
      if (row.filteredIndex === memoryBreakIndex) {
        hasMemoryDivider = true;
        memoryDividerClassName = gapAfter(previousKind, "divider");
        previousKind = "divider";
      }
      if (dateDividers.has(index)) {
        hasDateDivider = true;
        dateDividerClassName = gapAfter(previousKind, "divider");
        previousKind = "divider";
      }
    }
    const stackClassName =
      surface === "chat"
        ? cn("relative gap-1", edges && gapAfter(previousKind, edges.top))
        : undefined;
    if (row.kind === "pending") {
      layout.push({
        kind: "pending",
        meetsAbove: cluster.meetsAbove,
        meetsBelow: cluster.meetsBelow,
        stackClassName,
      });
    } else {
      layout.push({
        // "" keeps the line (it has no gap class) apart from "no line".
        dateDividerClassName: hasDateDivider
          ? (dateDividerClassName ?? "")
          : undefined,
        kind: "message",
        meetsAbove: cluster.meetsAbove,
        meetsBelow: cluster.meetsBelow,
        memoryDividerClassName: hasMemoryDivider
          ? (memoryDividerClassName ?? "")
          : undefined,
        raw: row.raw,
        showSenderLabel,
        stackClassName,
      });
    }
    if (edges) {
      previousShown = index;
      previousEdges = edges;
    }
  });
  return layout;
}
