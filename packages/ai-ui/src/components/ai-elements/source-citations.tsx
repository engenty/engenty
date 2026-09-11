"use client";

import {
  Badge,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  cn,
} from "@engenty/ui-core";
import { BookOpen, ChevronDown, ShieldCheck } from "lucide-react";
import { memo, useState } from "react";
import { Link } from "react-router-dom";
import { MessageResponse } from "./message.js";

export interface CitationItem {
  chunkStartLine?: number;
  chunkText?: string;
  endLine?: number;
  kbName?: string;
  originalUrl?: string;
  slug?: string;
  startLine?: number;
  title: string;
  url: string;
}

export interface SourceCitationsProps {
  citations: CitationItem[];
}

export const SourceCitations = memo(({ citations }: SourceCitationsProps) => {
  if (!citations || citations.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 w-full">
      <div className="mb-2 flex select-none items-center gap-1.5 font-medium text-muted-foreground text-xs uppercase tracking-wider">
        <ShieldCheck className="size-4 shrink-0 text-emerald-500" />
        <span>Verified Sources</span>
      </div>
      <div className="grid gap-2">
        {citations.map((citation, index) => (
          <SourceCitationCard
            citation={citation}
            key={`${citation.url}-${index}`}
          />
        ))}
      </div>
    </div>
  );
});

SourceCitations.displayName = "SourceCitations";

function SourceCitationCard({ citation }: { citation: CitationItem }) {
  const [isOpen, setIsOpen] = useState(false);
  const { title, url, chunkText, startLine, endLine, chunkStartLine, kbName } =
    citation;

  const hasExcerpt = Boolean(chunkText);
  const lineLabel =
    startLine !== undefined && endLine !== undefined
      ? `Lines ${startLine}-${endLine}`
      : startLine === undefined
        ? ""
        : `Line ${startLine}`;

  return (
    <Collapsible
      className={cn(
        "overflow-hidden rounded-lg border border-border-soft bg-card/45 shadow-sm transition-all duration-200 hover:border-border hover:bg-card/65",
        isOpen && "border-border bg-card"
      )}
      onOpenChange={setIsOpen}
      open={isOpen}
    >
      <div className="flex items-center justify-between gap-3 p-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-semibold text-foreground text-sm">
              {title}
            </span>
            {kbName && (
              <Badge
                className="h-4 shrink-0 rounded-md bg-muted px-1.5 py-0 font-normal text-[10px] text-muted-foreground"
                variant="secondary"
              >
                {kbName}
              </Badge>
            )}
          </div>
          {url.startsWith("http") ? (
            <a
              className="flex w-fit items-center gap-1 truncate text-muted-foreground text-xs transition-colors hover:text-primary"
              href={url}
              rel="noreferrer"
              target="_blank"
            >
              <BookOpen className="size-3 shrink-0" />
              <span className="truncate">{url}</span>
            </a>
          ) : (
            <Link
              className="flex w-fit items-center gap-1 truncate text-muted-foreground text-xs transition-colors hover:text-primary"
              to={url}
            >
              <BookOpen className="size-3 shrink-0" />
              <span className="truncate">{url}</span>
            </Link>
          )}
        </div>

        {hasExcerpt && (
          <CollapsibleTrigger asChild>
            <button
              className="flex size-7 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              type="button"
            >
              <ChevronDown
                className={cn(
                  "size-4 text-muted-foreground/60 transition-transform duration-200",
                  isOpen && "rotate-180"
                )}
              />
              <span className="sr-only">Toggle Excerpt</span>
            </button>
          </CollapsibleTrigger>
        )}
      </div>

      {hasExcerpt && chunkText && (
        <CollapsibleContent className="overflow-hidden border-border-soft border-t data-[state=closed]:animate-out">
          <div className="max-h-60 overflow-y-auto bg-muted/15 p-3 font-sans text-foreground/80 text-sm leading-relaxed">
            <div className="flex flex-col gap-0.5 font-mono text-xs leading-5">
              {chunkText
                .split("\n")
                .map((line, idx) => {
                  const chunkStart = chunkStartLine ?? startLine;
                  const lineNum =
                    chunkStart === undefined ? undefined : chunkStart + idx;
                  const hasLineAnchor =
                    url.includes("#L") || url.includes("#l");
                  const isHighlighted =
                    lineNum !== undefined &&
                    startLine !== undefined &&
                    endLine !== undefined &&
                    lineNum >= startLine &&
                    lineNum <= endLine;

                  return { line, isHighlighted, hasLineAnchor, idx };
                })
                .filter((item) => !item.hasLineAnchor || item.isHighlighted)
                .map(({ line, isHighlighted, idx }) => (
                  <div
                    className={cn(
                      "flex items-start rounded px-2 py-0.5 transition-colors",
                      isHighlighted
                        ? "bg-amber-500/20 font-medium dark:bg-amber-500/30"
                        : "bg-transparent"
                    )}
                    key={idx}
                  >
                    <MessageResponse className="prose prose-sm max-w-none flex-1 font-mono text-foreground/85 text-xs leading-5 [&_a]:text-primary hover:[&_a]:underline [&_img]:max-h-20 [&_img]:w-auto [&_li]:my-0 [&_ol]:my-0 [&_p]:my-0 [&_ul]:my-0">
                      {line}
                    </MessageResponse>
                  </div>
                ))}
            </div>
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}
