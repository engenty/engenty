"use client";

import {
  Badge,
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@engenty/ui-core";
import type { FieldSuggestion } from "../interrupts/hitl-approval-card";
import { HitlApprovalCard } from "../interrupts/hitl-approval-card";

export function CopilotPanelHitlTranscriptBlock({
  applySelectedLabel,
  cancelLabel,
  isApplying,
  latestSuggestions,
  onApplySuggestions,
  onCancel,
  selectedCandidateValues,
  selectedCountLabel,
  selectedSuggestions,
  setSelectedCandidateValues,
  setSelectedSuggestions,
  suggestedUpdatesLabel,
}: {
  applySelectedLabel: string;
  cancelLabel: string;
  isApplying: boolean;
  latestSuggestions: FieldSuggestion[];
  onApplySuggestions: () => void;
  onCancel: () => void;
  selectedCandidateValues?: Record<string, string | null>;
  selectedCountLabel: string;
  selectedSuggestions: Record<string, boolean>;
  setSelectedCandidateValues?: (
    v:
      | Record<string, string | null>
      | ((prev: Record<string, string | null>) => Record<string, string | null>)
  ) => void;
  setSelectedSuggestions: (
    v:
      | Record<string, boolean>
      | ((prev: Record<string, boolean>) => Record<string, boolean>)
  ) => void;
  suggestedUpdatesLabel: string;
}) {
  return (
    <HitlApprovalCard
      applyLabel={applySelectedLabel}
      className="mt-2"
      disabled={isApplying}
      onApply={() => void onApplySuggestions()}
      onReject={onCancel}
      onSelectedCandidateChange={
        setSelectedCandidateValues
          ? (field, value) =>
              setSelectedCandidateValues((prev) => ({
                ...prev,
                [field]: value,
              }))
          : undefined
      }
      onSelectedChange={(field, checked) =>
        setSelectedSuggestions((prev) => ({
          ...prev,
          [field]: checked,
        }))
      }
      rejectLabel={cancelLabel}
      selected={selectedSuggestions}
      selectedCandidateValues={selectedCandidateValues}
      selectedLabel={selectedCountLabel}
      suggestions={latestSuggestions}
      titleLabel={suggestedUpdatesLabel}
    />
  );
}

export function CopilotPanelHitlAppliedBlock({
  appliedSuggestions,
  selectedCountLabel,
  suggestedUpdatesLabel,
}: {
  appliedSuggestions: FieldSuggestion[];
  selectedCountLabel: string;
  suggestedUpdatesLabel: string;
}) {
  if (appliedSuggestions.length === 0) {
    return null;
  }
  return (
    <HitlApprovalCard
      className="mt-2"
      compactAppliedLabel={suggestedUpdatesLabel}
      defaultExpanded={false}
      mode="applied"
      onApply={() => {}}
      onReject={() => {}}
      onSelectedChange={() => {}}
      selected={Object.fromEntries(
        appliedSuggestions.map((suggestion) => [suggestion.field, true])
      )}
      selectedLabel={selectedCountLabel}
      suggestions={appliedSuggestions}
      titleLabel={suggestedUpdatesLabel}
    />
  );
}

export function CopilotPanelHitlPopover({
  applySelectedLabel,
  cancelLabel,
  isApplying,
  latestSuggestions,
  onApplySuggestions,
  onCancel,
  selectedCandidateValues,
  selectedCountLabel,
  selectedSuggestions,
  setSelectedCandidateValues,
  setSelectedSuggestions,
  suggestedUpdatesLabel,
}: {
  applySelectedLabel: string;
  cancelLabel: string;
  isApplying: boolean;
  latestSuggestions: FieldSuggestion[];
  onApplySuggestions: () => void;
  onCancel: () => void;
  selectedCandidateValues?: Record<string, string | null>;
  selectedCountLabel: string;
  selectedSuggestions: Record<string, boolean>;
  setSelectedCandidateValues?: (
    v:
      | Record<string, string | null>
      | ((prev: Record<string, string | null>) => Record<string, string | null>)
  ) => void;
  setSelectedSuggestions: (
    v:
      | Record<string, boolean>
      | ((prev: Record<string, boolean>) => Record<string, boolean>)
  ) => void;
  suggestedUpdatesLabel: string;
}) {
  return (
    <div className="shrink-0 border-border border-t bg-muted/15 px-3 py-2">
      <Popover modal={false}>
        <PopoverTrigger asChild>
          <Button
            className="h-8 w-full justify-between gap-2 font-normal"
            size="sm"
            type="button"
            variant="outline"
          >
            <span className="min-w-0 truncate text-left">
              {suggestedUpdatesLabel}
            </span>
            <Badge className="shrink-0 tabular-nums" variant="secondary">
              {latestSuggestions.length}
            </Badge>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="center"
          className="max-h-[min(70vh,32rem)] w-[min(calc(100vw-2rem),28rem)] overflow-y-auto p-3"
          onOpenAutoFocus={(event) => event.preventDefault()}
          side="top"
        >
          <HitlApprovalCard
            applyLabel={applySelectedLabel}
            disabled={isApplying}
            onApply={() => void onApplySuggestions()}
            onReject={onCancel}
            onSelectedCandidateChange={
              setSelectedCandidateValues
                ? (field, value) =>
                    setSelectedCandidateValues((prev) => ({
                      ...prev,
                      [field]: value,
                    }))
                : undefined
            }
            onSelectedChange={(field, checked) =>
              setSelectedSuggestions((prev) => ({
                ...prev,
                [field]: checked,
              }))
            }
            rejectLabel={cancelLabel}
            selected={selectedSuggestions}
            selectedCandidateValues={selectedCandidateValues}
            selectedLabel={selectedCountLabel}
            suggestions={latestSuggestions}
            titleLabel={suggestedUpdatesLabel}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
