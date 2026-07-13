// ChainOfThought step renderers for the copilot tool-call timeline.
// Each step shows the tool action plus the rich content it produced:
// search-result chips, image thumbnails, and a short output snippet —
// the "chain of tool calls" half of the widget. (The "chain of thoughts" /
// reasoning half is a parked server vertical — see reasoning-vertical.md.)
"use client";

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@engenty/ui-core";
import type { LucideIcon } from "lucide-react";
import { Globe, Search, Zap } from "lucide-react";
import {
  ChainOfThoughtSearchResult,
  ChainOfThoughtSearchResults,
  ChainOfThoughtStep,
  type ChainOfThoughtStepStatus,
} from "../../ai-elements/chain-of-thought";
import {
  collectToolImages,
  collectWebSearchResults,
  detectToolOutputError,
  extractProseSnippet,
  findFirstStringDeep,
  formatHost,
} from "../tool-call/tool-call-card-utils";
import {
  getToolDisplayLabel,
  getToolState,
  type ToolPartLike,
} from "./copilot-message-parts";

const MAX_RESULT_CHIPS = 6;
const MAX_IMAGES = 4;
const MAX_SNIPPET_CHARS = 320;

// Map tool state to a ChainOfThoughtStep status.
export function toolStateToStepStatus(
  state: "pending" | "running" | "completed" | "error"
): ChainOfThoughtStepStatus {
  if (state === "running" || state === "pending") {
    return "active";
  }
  if (state === "error") {
    return "error";
  }
  return "complete";
}

// Pick an icon for a tool call based on its name.
export function toolIcon(toolName: string): LucideIcon {
  const name = toolName.toLowerCase();
  if (name.includes("search") || name.includes("web")) {
    return Search;
  }
  if (
    name.includes("browse") ||
    name.includes("url") ||
    name.includes("fetch")
  ) {
    return Globe;
  }
  return Zap;
}

function clampSnippet(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= MAX_SNIPPET_CHARS) {
    return oneLine;
  }
  return `${oneLine.slice(0, MAX_SNIPPET_CHARS - 1)}…`;
}

interface StepContent {
  errorMessage: string | null;
  images: Array<{ caption: string | null; url: string }>;
  snippet: string | null;
  status: ChainOfThoughtStepStatus;
}

// Resolve a step's visible content. An output-present tool can still carry an error
// payload (e.g. a Zod issue array from a bad arg); detecting it flips the step to an
// error status + message instead of a misleading green check. Otherwise we surface
// only genuine prose — never ID dumps or stringified JSON (those stay in ToolCallCard).
function resolveStepContent(part: ToolPartLike): StepContent {
  const errorMessage = detectToolOutputError(part.output);
  const status: ChainOfThoughtStepStatus = errorMessage
    ? "error"
    : toolStateToStepStatus(getToolState(part));
  const images = collectToolImages(part.output).slice(0, MAX_IMAGES);
  const prose = errorMessage ? null : extractProseSnippet(part.output);
  return {
    errorMessage: errorMessage ? clampSnippet(errorMessage) : null,
    images,
    snippet: prose ? clampSnippet(prose) : null,
    status,
  };
}

function ChainOfThoughtImageGrid({
  images,
}: {
  images: Array<{ caption: string | null; url: string }>;
}) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {images.map((img) => (
        <HoverCard closeDelay={100} key={img.url} openDelay={200}>
          <HoverCardTrigger asChild>
            <div
              aria-label={img.caption ?? "Tool result"}
              className="size-14 shrink-0 cursor-pointer overflow-hidden rounded-md border border-border/40 bg-muted/30"
              role="img"
            >
              {/* biome-ignore lint/correctness/useImageSize: remote tool images have no known dimensions */}
              <img
                alt={img.caption ?? "Tool result"}
                className="size-full object-cover"
                src={img.url}
              />
            </div>
          </HoverCardTrigger>
          <HoverCardContent
            align="start"
            className="w-auto max-w-72 p-2"
            side="top"
          >
            {/* Checkered background reveals transparency. --ck-sq sets the
                alternate-square color; base color comes from bg-white/bg-zinc-950. */}
            <div
              className={[
                "overflow-hidden rounded-sm border border-border/30",
                "bg-white dark:bg-zinc-950",
                "[--ck-sq:#e4e4e7] dark:[--ck-sq:#27272a]",
              ].join(" ")}
              style={{
                backgroundImage: [
                  "linear-gradient(45deg, var(--ck-sq) 25%, transparent 25%)",
                  "linear-gradient(-45deg, var(--ck-sq) 25%, transparent 25%)",
                  "linear-gradient(45deg, transparent 75%, var(--ck-sq) 75%)",
                  "linear-gradient(-45deg, transparent 75%, var(--ck-sq) 75%)",
                ].join(","),
                backgroundSize: "12px 12px",
                backgroundPosition: "0 0, 0 6px, 6px -6px, -6px 0px",
              }}
            >
              {/* biome-ignore lint/correctness/useImageSize: remote tool images have no known dimensions */}
              <img
                alt={img.caption ?? "Tool result"}
                className="block max-h-64 max-w-full object-contain"
                src={img.url}
              />
            </div>
            {img.caption ? (
              <p className="mt-1.5 px-0.5 text-muted-foreground text-xs leading-snug">
                {img.caption}
              </p>
            ) : null}
          </HoverCardContent>
        </HoverCard>
      ))}
    </div>
  );
}

// Images + an error message or prose snippet — the expanded body shared by every step.
// Compact by design: the full input/output lives in the expandable ToolCallCard.
function ToolStepBody({
  errorMessage,
  images,
  snippet,
}: Omit<StepContent, "status">) {
  if (images.length === 0 && !(snippet || errorMessage)) {
    return null;
  }

  return (
    <>
      {images.length > 0 ? <ChainOfThoughtImageGrid images={images} /> : null}
      {errorMessage ? (
        <p className="mt-1 text-destructive/85 text-xs leading-relaxed">
          {errorMessage}
        </p>
      ) : null}
      {!errorMessage && snippet ? (
        <p className="mt-1 text-muted-foreground/80 text-xs leading-relaxed">
          {snippet}
        </p>
      ) : null}
    </>
  );
}

export function WebSearchStep({
  part,
  isStreaming,
}: {
  isStreaming: boolean;
  part: ToolPartLike;
}) {
  const { errorMessage, images, status } = resolveStepContent(part);
  const query =
    findFirstStringDeep(part.input, ["query", "search_query", "q"]) ??
    findFirstStringDeep(part.output, ["query", "search_query", "q"]);
  const results = collectWebSearchResults(part.output).slice(
    0,
    MAX_RESULT_CHIPS
  );
  const label = query ? `Search: ${query}` : "Web search";
  const description =
    !(isStreaming || errorMessage) && results.length > 0
      ? `${results.length} result${results.length === 1 ? "" : "s"}`
      : undefined;

  return (
    <ChainOfThoughtStep
      description={description}
      icon={Search}
      label={label}
      status={status}
    >
      {!errorMessage && results.length > 0 ? (
        <ChainOfThoughtSearchResults>
          {results.map((r, i) => {
            const host = r.url ? formatHost(r.url) : null;
            const display = host ?? r.title ?? "result";
            return (
              <ChainOfThoughtSearchResult
                key={`${r.url ?? r.title ?? i}`}
                title={r.title ?? undefined}
              >
                {display}
              </ChainOfThoughtSearchResult>
            );
          })}
        </ChainOfThoughtSearchResults>
      ) : null}
      {/* Search results live in the chips; only surface images/errors here. */}
      <ToolStepBody
        errorMessage={errorMessage}
        images={images}
        snippet={null}
      />
    </ChainOfThoughtStep>
  );
}

const MAX_ARG_CHIPS = 4;
const ARG_CHIP_VALUE_MAX = 40;

/**
 * Short scalar inputs as chips ("repoName: vercel/next.js") so a generic tool
 * row shows what it acted on — mirrors the search step's result chips.
 */
function collectArgChips(
  input: unknown
): Array<{ key: string; value: string }> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return [];
  }
  // engenty_tool_execute wraps the real args: { id, input: {...} }.
  const record = input as Record<string, unknown>;
  const payload =
    record.input && typeof record.input === "object" ? record.input : record;
  const chips: Array<{ key: string; value: string }> = [];
  for (const [key, value] of Object.entries(
    payload as Record<string, unknown>
  )) {
    if (chips.length >= MAX_ARG_CHIPS) {
      break;
    }
    if (key === "account" || value === null || value === undefined) {
      continue;
    }
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      const raw = String(value).trim();
      if (!raw) {
        continue;
      }
      const display =
        raw.length > ARG_CHIP_VALUE_MAX
          ? `${raw.slice(0, ARG_CHIP_VALUE_MAX - 1)}…`
          : raw;
      chips.push({ key, value: display });
    }
  }
  return chips;
}

export function GenericToolStep({
  part,
  toolName,
  isStreaming,
}: {
  isStreaming: boolean;
  part: ToolPartLike;
  toolName: string;
}) {
  const { errorMessage, images, snippet, status } = resolveStepContent(part);
  const label = getToolDisplayLabel(part, toolName);
  const Icon = toolIcon(toolName);
  // The resolver's secondary descriptor (scope, path, command, …) the label drops.
  const description =
    typeof part.metadata === "string" && part.metadata.trim()
      ? part.metadata.trim()
      : undefined;
  // Skip arg chips when the label already quotes the primary argument.
  const argChips = label.includes('"') ? [] : collectArgChips(part.input);

  return (
    <ChainOfThoughtStep
      description={description}
      icon={Icon}
      label={label}
      status={status}
    >
      {argChips.length > 0 ? (
        <ChainOfThoughtSearchResults>
          {argChips.map((chip) => (
            <ChainOfThoughtSearchResult key={chip.key} title={chip.key}>
              {chip.value}
            </ChainOfThoughtSearchResult>
          ))}
        </ChainOfThoughtSearchResults>
      ) : null}
      {isStreaming ? null : (
        <ToolStepBody
          errorMessage={errorMessage}
          images={images}
          snippet={snippet}
        />
      )}
    </ChainOfThoughtStep>
  );
}
