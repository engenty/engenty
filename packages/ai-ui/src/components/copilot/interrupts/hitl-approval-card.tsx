"use client";

import { Button, Checkbox, cn } from "@engenty/ui-core";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { HTMLAttributes } from "react";
import { useMemo, useState } from "react";

export interface SuggestionCandidate {
  evidence_snippet?: string;
  label?: string;
  source_url?: string;
  value: string | null;
}

export interface FieldSuggestion {
  candidates?: SuggestionCandidate[];
  confidence?: number;
  evidence_snippet?: string;
  field: string;
  source_url?: string;
  value: string | null;
}

export interface HitlApprovalCardProps extends HTMLAttributes<HTMLDivElement> {
  applyLabel?: string;
  compactAppliedLabel?: string;
  defaultExpanded?: boolean;
  disabled?: boolean;
  mode?: "review" | "applied";
  onApply: () => void;
  onReject: () => void;
  onSelectedCandidateChange?: (field: string, value: string | null) => void;
  onSelectedChange: (field: string, checked: boolean) => void;
  rejectLabel?: string;
  selected: Record<string, boolean>;
  selectedCandidateValues?: Record<string, string | null>;
  selectedLabel?: string;
  suggestions: FieldSuggestion[];
  titleLabel?: string;
}

export function HitlApprovalCard({
  suggestions,
  selected,
  selectedCandidateValues = {},
  onSelectedChange,
  onSelectedCandidateChange,
  onApply,
  onReject,
  applyLabel = "Apply",
  compactAppliedLabel = "Applied suggestions",
  defaultExpanded = true,
  rejectLabel = "Reject",
  selectedLabel = "selected",
  titleLabel = "Suggested updates",
  disabled = false,
  mode = "review",
  className,
  ...props
}: HitlApprovalCardProps) {
  const selectedCount = Object.values(selected).filter(Boolean).length;
  const isApplied = mode === "applied";
  const [expanded, setExpanded] = useState(defaultExpanded);
  const resolvedSuggestions = useMemo(() => {
    if (!isApplied) {
      return suggestions;
    }

    return suggestions.map((suggestion) => {
      const chosenCandidate = suggestion.candidates?.find(
        (candidate) =>
          String(candidate.value ?? "") ===
          String(selectedCandidateValues[suggestion.field] ?? "")
      );

      return {
        ...suggestion,
        candidates: undefined,
        evidence_snippet:
          chosenCandidate?.evidence_snippet ?? suggestion.evidence_snippet,
        source_url: chosenCandidate?.source_url ?? suggestion.source_url,
        value:
          selectedCandidateValues[suggestion.field] ??
          chosenCandidate?.value ??
          suggestion.value,
      };
    });
  }, [isApplied, selectedCandidateValues, suggestions]);
  const summaryCount = isApplied ? resolvedSuggestions.length : selectedCount;

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div
      className={cn("space-y-4 rounded-md border bg-muted/30 p-4", className)}
      {...props}
    >
      {isApplied ? (
        <button
          className="flex w-full items-center justify-between gap-3 text-left"
          onClick={() => setExpanded((value) => !value)}
          type="button"
        >
          <div className="flex min-w-0 items-center gap-2">
            {expanded ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0">
              <div className="font-medium text-sm">{compactAppliedLabel}</div>
              <div className="text-muted-foreground text-xs">
                {summaryCount} {selectedLabel}
              </div>
            </div>
          </div>
        </button>
      ) : (
        <div className="font-medium text-sm">
          {titleLabel} ({summaryCount} {selectedLabel})
        </div>
      )}
      {expanded ? (
        <div className="space-y-3">
          {resolvedSuggestions.map((s) => {
            const hasCandidates = s.candidates && s.candidates.length > 1;
            const displayValue =
              hasCandidates && onSelectedCandidateChange
                ? (selectedCandidateValues[s.field] ??
                  s.candidates?.[0]?.value ??
                  s.value)
                : s.value;
            return (
              <div
                className="flex items-start gap-3 rounded border bg-background p-3"
                key={s.field}
              >
                {isApplied ? null : (
                  <Checkbox
                    checked={selected[s.field] ?? false}
                    id={`hitl-${s.field}`}
                    onCheckedChange={(c) =>
                      onSelectedChange(s.field, c === true)
                    }
                  />
                )}
                <div className="min-w-0 flex-1">
                  {isApplied ? (
                    <div className="font-medium text-sm">{s.field}</div>
                  ) : (
                    <label
                      className="cursor-pointer font-medium text-sm"
                      htmlFor={`hitl-${s.field}`}
                    >
                      {s.field}
                    </label>
                  )}
                  {hasCandidates &&
                  s.candidates &&
                  onSelectedCandidateChange &&
                  !isApplied ? (
                    <div
                      aria-label={`Choose ${s.field}`}
                      className="mt-2 space-y-2"
                      role="radiogroup"
                    >
                      {s.candidates.map((cand, i) => {
                        const val = String(cand.value ?? "");
                        const chosen =
                          selectedCandidateValues[s.field] ??
                          s.candidates?.[0]?.value ??
                          null;
                        const isChecked = val === String(chosen ?? "");
                        return (
                          <label
                            className={cn(
                              "flex cursor-pointer items-center gap-2 rounded border px-2 py-1.5 text-sm transition-colors",
                              isChecked
                                ? "border-primary bg-primary/5"
                                : "border-transparent hover:bg-muted/50"
                            )}
                            key={i}
                          >
                            <input
                              checked={isChecked}
                              className="size-4"
                              name={`hitl-candidate-${s.field}`}
                              onChange={() =>
                                onSelectedCandidateChange(
                                  s.field,
                                  cand.value ?? null
                                )
                              }
                              type="radio"
                              value={val}
                            />
                            <span className="flex-1">
                              {cand.label ?? cand.value ?? "(null)"}
                            </span>
                            {cand.source_url && (
                              <a
                                className="text-link text-xs hover:underline"
                                href={cand.source_url}
                                onClick={(e) => e.stopPropagation()}
                                rel="noopener noreferrer"
                                target="_blank"
                              >
                                Source
                              </a>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="mt-1 text-muted-foreground text-sm">
                      {displayValue ?? "(null)"}
                    </p>
                  )}
                  {!hasCandidates && s.source_url && (
                    <a
                      className="mt-1 block truncate text-link text-xs hover:underline"
                      href={s.source_url}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      {s.source_url}
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
      {isApplied ? null : (
        <div className="flex gap-2">
          <Button
            disabled={disabled || selectedCount === 0}
            onClick={onApply}
            size="sm"
          >
            {applyLabel}
          </Button>
          <Button
            disabled={disabled}
            onClick={onReject}
            size="sm"
            variant="outline"
          >
            {rejectLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
