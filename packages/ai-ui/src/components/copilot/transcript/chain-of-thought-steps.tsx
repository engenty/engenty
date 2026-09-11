// ChainOfThought step renderers for the copilot tool-call timeline.
// Each step is a row in an expandable list (AI Elements chain-of-thought):
// type icon + connector line, label, and always-visible details (≤4 lines).
// Special cases: WebSearch (result chips) and Skill (playbook preview).
// (The "chain of thoughts" / reasoning half is a parked server vertical —
// see reasoning-vertical.md.)
"use client";

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@engenty/ui-core";
import type { LucideIcon } from "lucide-react";
import { BookOpen, Globe, Search, Zap } from "lucide-react";
import { resolveTranscriptToolDisplay } from "../../../ag-ui/resolve-transcript-tool-display.js";
import {
  ChainOfThoughtSearchResult,
  ChainOfThoughtSearchResults,
  ChainOfThoughtStep,
  type ChainOfThoughtStepStatus,
} from "../../ai-elements/chain-of-thought";
import {
  asRecord,
  coerceToolOutput,
  collectToolImages,
  collectWebSearchResults,
  detectToolOutputError,
  extractProseSnippet,
  findFirstStringDeep,
  formatHost,
  summarizeFileReadBrief,
  summarizeToolStepBrief,
} from "../tool-call/tool-call-card-utils";
import {
  getToolDisplayLabel,
  getToolState,
  type ToolPartLike,
} from "./copilot-message-parts";

const MAX_RESULT_CHIPS = 6;
const MAX_IMAGES = 4;
const MAX_SNIPPET_CHARS = 480;
const MAX_ARG_CHIPS = 4;
const ARG_CHIP_VALUE_MAX = 40;
const UUID_LIKE_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID_ARG_KEY_RE = /(^|_)(id|uuid|guid)$/i;

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

/** True when the wire/resolved tool is the workspace skill loader. */
export function isSkillToolName(toolName: string): boolean {
  const name = toolName.trim().toLowerCase();
  return name === "skill" || name.endsWith(".skill") || name.endsWith("_skill");
}

/** True when the tool is a skill catalog / skill search. */
export function isSkillSearchToolName(toolName: string): boolean {
  const name = toolName.trim().toLowerCase();
  return name === "skill_search" || name.includes("skill_search");
}

// Pick an icon for a tool call based on its name.
export function toolIcon(toolName: string): LucideIcon {
  const name = toolName.toLowerCase();
  if (isSkillToolName(name)) {
    return BookOpen;
  }
  if (
    name.includes("search") ||
    name.includes("web") ||
    isSkillSearchToolName(name)
  ) {
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
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= MAX_SNIPPET_CHARS) {
    return collapsed;
  }
  return `${collapsed.slice(0, MAX_SNIPPET_CHARS - 1)}…`;
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
  const output = coerceToolOutput(part.output);
  const errorMessage = detectToolOutputError(output);
  const status: ChainOfThoughtStepStatus = errorMessage
    ? "error"
    : toolStateToStepStatus(getToolState(part));
  const images = collectToolImages(output).slice(0, MAX_IMAGES);
  const prose = errorMessage ? null : extractProseSnippet(output);
  return {
    errorMessage: errorMessage ? clampSnippet(errorMessage) : null,
    images,
    snippet: prose ? clampSnippet(prose) : null,
    status,
  };
}

/**
 * Prefer a human label over the AG-UI "tool" / "Ran tool" placeholder that
 * sticks when the provider opens a call before the real name arrives.
 */
export function resolveToolStepLabel(
  part: ToolPartLike,
  toolName: string
): string {
  const explicit = getToolDisplayLabel(part, toolName).trim();
  const isPlaceholder =
    !explicit ||
    explicit === "tool" ||
    explicit === "Ran tool" ||
    toolName === "tool";
  if (!isPlaceholder) {
    return explicit;
  }
  const wireName =
    part.resolvedToolName?.trim() ||
    (toolName === "tool" ? "" : toolName) ||
    // engenty_tool_execute shape even when the wire name was lost.
    (typeof part.input === "object" &&
    part.input &&
    "id" in part.input &&
    typeof (part.input as { id?: unknown }).id === "string"
      ? "engenty_tool_execute"
      : toolName);
  const resolved = resolveTranscriptToolDisplay({
    toolName: wireName,
    input: part.input,
    output: coerceToolOutput(part.output),
  });
  if (resolved.displayLabel && resolved.displayLabel !== "Ran tool") {
    return resolved.displayLabel;
  }
  // Still the placeholder: the wire name never arrived and nothing above could
  // recover it. A file-read dump names the file itself, so "Ran tool" can at
  // least become "Read <basename>".
  return (
    summarizeFileReadBrief({
      input: asRecord(part.input),
      output: part.output,
      toolName: wireName,
    }) ?? resolved.displayLabel
  );
}

function ChainOfThoughtImageGrid({
  images,
}: {
  images: Array<{ caption: string | null; url: string }>;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {images.map((img) => (
        <HoverCard closeDelay={100} key={img.url} openDelay={200}>
          <HoverCardTrigger asChild>
            <div
              aria-label={img.caption ?? "Tool result"}
              className="size-14 shrink-0 cursor-pointer overflow-hidden rounded-md border border-border-soft bg-muted/30"
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
                "overflow-hidden rounded-sm border border-border-soft",
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

// Images + an error message or prose snippet — always visible under the label
// (clamped to ~4 lines). Full input/output lives in the expandable ToolCallCard.
function ToolStepBody({
  errorMessage,
  images,
  snippet,
}: Omit<StepContent, "status">) {
  if (images.length === 0 && !(snippet || errorMessage)) {
    return null;
  }

  return (
    <div className="space-y-1.5">
      {images.length > 0 ? <ChainOfThoughtImageGrid images={images} /> : null}
      {errorMessage ? (
        <p className="line-clamp-4 text-destructive/85 text-xs leading-relaxed">
          {errorMessage}
        </p>
      ) : null}
      {!errorMessage && snippet ? (
        <p className="line-clamp-4 text-muted-foreground/80 text-xs leading-relaxed">
          {snippet}
        </p>
      ) : null}
    </div>
  );
}

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
    if (
      key === "account" ||
      ID_ARG_KEY_RE.test(key) ||
      value === null ||
      value === undefined
    ) {
      continue;
    }
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      const raw = String(value).trim();
      if (!raw || UUID_LIKE_RE.test(raw)) {
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

function ArgChips({ chips }: { chips: Array<{ key: string; value: string }> }) {
  if (chips.length === 0) {
    return null;
  }
  return (
    <ChainOfThoughtSearchResults>
      {chips.map((chip) => (
        <ChainOfThoughtSearchResult key={chip.key} title={chip.key}>
          {chip.value}
        </ChainOfThoughtSearchResult>
      ))}
    </ChainOfThoughtSearchResults>
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
  const output = coerceToolOutput(part.output);
  const query =
    findFirstStringDeep(part.input, ["query", "search_query", "q"]) ??
    findFirstStringDeep(output, ["query", "search_query", "q"]);
  const results = collectWebSearchResults(output).slice(0, MAX_RESULT_CHIPS);
  const label = query ? `Searching for "${query}"` : "Web search";
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
      {!(isStreaming || errorMessage) && results.length > 0 ? (
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
      {isStreaming ? null : (
        <ToolStepBody
          errorMessage={errorMessage}
          images={images}
          snippet={null}
        />
      )}
    </ChainOfThoughtStep>
  );
}

/**
 * Extract a readable skill body from tool output (markdown / text fields).
 * Falls back to extractProseSnippet for structured wrappers.
 */
function extractSkillPreview(output: unknown): string | null {
  const coerced = coerceToolOutput(output);
  if (typeof coerced === "string") {
    const trimmed = coerced.trim();
    return trimmed ? clampSnippet(trimmed) : null;
  }
  if (!coerced || typeof coerced !== "object" || Array.isArray(coerced)) {
    return extractProseSnippet(output);
  }
  const record = coerced as Record<string, unknown>;
  for (const key of [
    "content",
    "text",
    "markdown",
    "body",
    "skill",
    "instructions",
    "message",
    "summary",
  ] as const) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return clampSnippet(value);
    }
  }
  // Nested `{ data: { content } }` / MCP text blocks.
  const prose = extractProseSnippet(output);
  return prose ? clampSnippet(prose) : null;
}

function resolveSkillName(part: ToolPartLike): string | null {
  return (
    findFirstStringDeep(part.input, [
      "name",
      "skill",
      "skillName",
      "skill_name",
      "id",
      "path",
    ]) ??
    findFirstStringDeep(coerceToolOutput(part.output), [
      "name",
      "skill",
      "skillName",
      "title",
    ])
  );
}

export function SkillStep({
  part,
  toolName,
  isStreaming,
}: {
  isStreaming: boolean;
  part: ToolPartLike;
  toolName: string;
}) {
  const { errorMessage, images, status } = resolveStepContent(part);
  const skillName = resolveSkillName(part);
  const label = skillName
    ? `Skill: "${skillName}"`
    : resolveToolStepLabel(part, toolName);
  const preview =
    isStreaming || errorMessage ? null : extractSkillPreview(part.output);

  return (
    <ChainOfThoughtStep icon={BookOpen} label={label} status={status}>
      {isStreaming ? null : (
        <ToolStepBody
          errorMessage={errorMessage}
          images={images}
          snippet={preview}
        />
      )}
    </ChainOfThoughtStep>
  );
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
  const label = resolveToolStepLabel(part, toolName);
  const resolvedName = part.resolvedToolName?.trim() || toolName;
  const Icon = toolIcon(resolvedName);
  // The resolver's secondary descriptor (scope, path, command, …) the label drops.
  const description =
    typeof part.metadata === "string" && part.metadata.trim()
      ? part.metadata.trim()
      : undefined;
  const brief =
    isStreaming || errorMessage
      ? null
      : summarizeToolStepBrief({
          input: part.input,
          metadata: description,
          output: part.output,
          toolName: resolvedName,
        });
  // Prefer the brief summary; only fall back to arg chips when we have nothing
  // better and the label doesn't already quote the primary arg.
  const argChips =
    isStreaming || brief || label.includes('"')
      ? []
      : collectArgChips(part.input);

  return (
    <ChainOfThoughtStep
      description={description}
      icon={Icon}
      label={label}
      status={status}
    >
      {brief ? (
        <p className="line-clamp-4 text-muted-foreground/80 text-xs leading-relaxed">
          {brief}
        </p>
      ) : (
        <ArgChips chips={argChips} />
      )}
      {isStreaming ? null : (
        <ToolStepBody
          errorMessage={errorMessage}
          images={images}
          // Avoid duplicating the brief when prose equals it.
          snippet={
            snippet && brief && snippet.trim() === brief.trim() ? null : snippet
          }
        />
      )}
    </ChainOfThoughtStep>
  );
}
