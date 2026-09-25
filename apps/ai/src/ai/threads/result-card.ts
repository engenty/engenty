// A stored result's chat card, laid out like a report card: a status badge,
// the headline, a muted line of context, what needs attention, the key
// figures, the findings with their key term in bold, the document's sections
// and the Open button.
//
// Every block is cut out of the run's answer — the specialist answers these
// fields alongside the document — so the card is the same whether the
// document is HTML, Markdown or rows in a table. Jev picks the blocks.

import { createClassifierClient, roleModelRef } from "@engenty/ai-core";
import {
  composeSurface,
  type SurfaceCandidate,
} from "@engenty/generative-a2ui/spec";
import type { ClassifierClient } from "@engenty/typesafe-client";

export interface ResultCard {
  components: Record<string, unknown>[];
  data: Record<string, unknown>;
}

const MAX_FIGURES = 6;
const MAX_HIGHLIGHTS = 5;
const MAX_SECTIONS = 6;
/** A finding or a section's gist is shown in full; this only stops a runaway. */
const MAX_LINE = 600;
/** Longest value a big number tile still reads well with. */
const TILE_VALUE_MAX = 14;
/** Highlights and sections kept when Jev is not asked. */
const FALLBACK_ROWS = 3;

const STATUS_TONES: Record<string, string> = {
  good: "success",
  neutral: "info",
  watch: "warning",
};

interface Figure {
  label: string;
  note: string | null;
  value: string;
}

interface Section {
  line: string;
  title: string;
}

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) {
    return flat;
  }
  const cut = flat.lastIndexOf(" ", max);
  return `${flat.slice(0, cut > max / 2 ? cut : max)}…`;
}

function text(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim() ? clip(value, max) : null;
}

function list<T>(
  value: unknown,
  max: number,
  read: (item: unknown) => T | null
): T[] {
  return Array.isArray(value)
    ? value
        .map(read)
        .filter((item): item is T => item !== null)
        .slice(0, max)
    : [];
}

function readFigure(item: unknown): Figure | null {
  const row = item as Record<string, unknown> | null;
  const label = text(row?.label, 80);
  const value = text(row?.value, 80);
  return label && value ? { label, note: text(row?.note, 160), value } : null;
}

function readSection(item: unknown): Section | null {
  const row = item as Record<string, unknown> | null;
  const title = text(row?.title, 120);
  const line = text(row?.line, MAX_LINE);
  return title && line ? { line, title } : null;
}

export function openButton(artifactId: string): SurfaceCandidate {
  return {
    components: [
      { children: ["open"], component: "Actions", id: "actions" },
      {
        action: {
          event: {
            context: { artifact_id: artifactId },
            name: "open_artifact",
          },
        },
        component: "Button",
        id: "open",
        // Relabelled in the reader's language by the chat card.
        label: "Open",
      },
    ],
    description: "The button that opens the whole result.",
    id: "actions",
    required: true,
  };
}

/**
 * Key figures as big number tiles when every value is short, else as a
 * label/value list — a tile with a sentence in it reads as a wall of text.
 */
function figureCandidates(figures: Figure[]): SurfaceCandidate[] {
  const listed = figures
    .map((f) => `${f.label} ${f.value}${f.note ? ` (${f.note})` : ""}`)
    .join("; ");
  const tiles = figures.every((f) => f.value.length <= TILE_VALUE_MAX);
  return [
    tiles
      ? {
          components: [
            {
              children: figures.map((_, index) => `figure_${index}`),
              columns: Math.min(figures.length, 3),
              component: "Grid",
              id: "figures_tiles",
            },
            ...figures.map((figure, index) => ({
              component: "Metric",
              id: `figure_${index}`,
              label: figure.label,
              value: figure.value,
              ...(figure.note ? { caption: figure.note } : {}),
            })),
          ],
          description: `The key figures: ${listed}.`,
          fallback: true,
          id: "figures_tiles",
        }
      : {
          components: [
            {
              component: "DetailGrid",
              id: "figures_facts",
              rows: figures.map((figure) => ({
                label: figure.label,
                value: figure.note
                  ? `${figure.value} · ${figure.note}`
                  : figure.value,
              })),
            },
          ],
          description: `The key figures: ${listed}.`,
          fallback: true,
          id: "figures_facts",
        },
  ];
}

/** Rows under a container, one candidate each so Jev keeps the ones that matter. */
function itemCandidates(
  container: string,
  items: { component: Record<string, unknown>; description: string }[],
  fallback: boolean
): SurfaceCandidate[] {
  if (items.length === 0) {
    return [];
  }
  return [
    {
      components: [{ component: "Column", gap: "sm", id: container }],
      description: container,
      id: container,
    },
    ...items.map((item, index) => {
      const id = `${container}_${index}`;
      return {
        components: [{ ...item.component, id }],
        description: item.description,
        fallback: fallback && index < FALLBACK_ROWS,
        id,
        parent: container,
      };
    }),
  ];
}

/** The building blocks a result offers, in the order the card shows them. */
export function resultCardCandidates(input: {
  artifactId: string;
  output: Record<string, unknown> | null;
  summary: string | null;
}): SurfaceCandidate[] {
  const out = input.output;
  const headline = text(out?.headline, 140);
  const meta = text(out?.meta, 200);
  const status = text(out?.status, 40);
  const attention = text(out?.attention, 400);
  const figures = list(out?.key_figures, MAX_FIGURES, readFigure);
  const highlights = list(out?.highlights, MAX_HIGHLIGHTS, (item) =>
    text(item, MAX_LINE)
  );
  const sections = list(out?.sections, MAX_SECTIONS, readSection);
  const candidates: SurfaceCandidate[] = [];

  if (status) {
    candidates.push({
      components: [
        {
          component: "Badge",
          id: "status",
          label: status,
          tone: STATUS_TONES[String(out?.status_tone)] ?? "default",
        },
      ],
      description: `The state at a glance: "${status}".`,
      fallback: true,
      id: "status",
    });
  }
  if (headline) {
    candidates.push({
      components: [
        { component: "Text", id: "headline", text: headline, variant: "h3" },
      ],
      description: "The headline.",
      id: "headline",
      required: true,
    });
  }
  if (meta) {
    candidates.push({
      components: [
        { component: "Text", id: "meta", text: meta, variant: "muted" },
      ],
      description: `Small print under the headline: ${meta}`,
      id: "meta",
      required: true,
    });
  }
  // The report above the card already carries the summary; the card repeats
  // it only when the result offers nothing else to show.
  if (input.summary && !headline && figures.length + highlights.length === 0) {
    candidates.push({
      components: [
        { component: "Text", id: "summary", text: clip(input.summary, 400) },
      ],
      description: "The result in two or three sentences.",
      fallback: true,
      id: "summary",
    });
  }
  if (attention) {
    candidates.push({
      components: [
        {
          component: "Callout",
          id: "attention",
          text: attention,
          tone: "warning",
        },
      ],
      description: `What needs attention: ${attention}`,
      fallback: true,
      id: "attention",
    });
  }
  if (figures.length > 0) {
    candidates.push(...figureCandidates(figures));
  }
  candidates.push(
    ...itemCandidates(
      "highlights",
      highlights.map((finding) => ({
        component: { component: "Markdown", text: `- ${finding}` },
        description: `The finding "${finding}"`,
      })),
      true
    ),
    ...itemCandidates(
      "sections",
      sections.map((section) => ({
        component: {
          component: "Row",
          subtitle: section.line,
          title: section.title,
          wrap: true,
        },
        description: `The section "${section.title}" — ${section.line}`,
      })),
      highlights.length === 0
    ),
    openButton(input.artifactId)
  );
  return candidates;
}

/** Platform classifier when bound and keyed; otherwise null (fail open). */
function defaultJevClient(): ClassifierClient | null {
  try {
    return createClassifierClient(roleModelRef("classifier"))?.client ?? null;
  } catch {
    return null;
  }
}

/** The card for a stored result, composed by Jev from what the run answered. */
export async function composeResultCard(input: {
  artifactId: string;
  jev?: ClassifierClient | null;
  output: Record<string, unknown> | null;
  summary: string | null;
  title: string;
}): Promise<ResultCard> {
  const candidates = resultCardCandidates(input);
  const composed = await composeSurface({
    candidates,
    context: { summary: input.summary, title: input.title },
    jev: input.jev === undefined ? defaultJevClient() : input.jev,
    prompt: `A report card for the result "${input.title}": show what matters most at a glance and leave the rest to the full document behind the Open button.`,
  });
  return { components: composed.components, data: composed.data };
}
