"use client";

import { useCallback, useEffect, useState } from "react";
import type { FieldSuggestion } from "../interrupts/hitl-approval-card";
import { getSuggestionsSignature } from "./copilot-drawer-utils";

export interface CopilotDrawerSuggestionsInjected {
  appendWithHeaders: (text: string) => Promise<void>;
  latestSuggestions: Array<{
    candidates?: Array<{ source_url?: string | null; value?: unknown }>;
    field: string;
    selected?: boolean;
    source_url?: string | null;
    value?: unknown;
  }>;
  selectedCandidateValues: Record<string, unknown>;
  selectedSuggestions: Record<string, boolean>;
  setApplyError: (message: string | null) => void;
  setIsApplying: (value: boolean) => void;
  setSelectedSuggestions: (value: Record<string, boolean>) => void;
}

export function useCopilotDrawerSuggestionsApply({
  collapseToCompactLauncher,
  injected,
  onApplySuccess,
  onApplySuggestions,
}: {
  collapseToCompactLauncher: () => void;
  injected: CopilotDrawerSuggestionsInjected;
  onApplySuccess?: () => void;
  onApplySuggestions?: (patch: Record<string, string | null>) => Promise<void>;
}) {
  const [appliedSuggestions, setAppliedSuggestions] = useState<
    FieldSuggestion[]
  >([]);
  const [dismissedSuggestionsSignature, setDismissedSuggestionsSignature] =
    useState<string | null>(null);

  const latestSuggestionsSignature = getSuggestionsSignature(
    injected.latestSuggestions
  );
  const shouldHideSuggestionsReview =
    injected.latestSuggestions.length > 0 &&
    dismissedSuggestionsSignature === latestSuggestionsSignature;

  const handleApplySuggestions = useCallback(async () => {
    if (!onApplySuggestions) {
      injected.setApplyError("No apply handler configured.");
      return;
    }
    const patch = Object.fromEntries(
      injected.latestSuggestions
        .filter((s) => injected.selectedSuggestions[s.field])
        .map((s) => {
          const hasCandidates = s.candidates && s.candidates.length > 0;
          const value = hasCandidates
            ? (injected.selectedCandidateValues[s.field] ??
              s.candidates?.[0]?.value ??
              s.value ??
              null)
            : (s.value ?? null);
          return [s.field, value == null ? null : String(value)];
        })
    ) as Record<string, string | null>;
    if (Object.keys(patch).length === 0) {
      return;
    }
    try {
      injected.setIsApplying(true);
      injected.setApplyError(null);
      await onApplySuggestions(patch);
      setAppliedSuggestions(
        injected.latestSuggestions
          .filter(
            (suggestion) => injected.selectedSuggestions[suggestion.field]
          )
          .map((suggestion) => {
            const resolvedValue =
              injected.selectedCandidateValues[suggestion.field] ??
              suggestion.candidates?.[0]?.value ??
              suggestion.value;
            const chosenCandidate = suggestion.candidates?.find(
              (candidate) =>
                String(candidate.value ?? "") === String(resolvedValue ?? "")
            );

            return {
              field: suggestion.field,
              value: resolvedValue == null ? null : String(resolvedValue),
              source_url:
                chosenCandidate?.source_url ??
                suggestion.source_url ??
                undefined,
            };
          })
      );
      setDismissedSuggestionsSignature(latestSuggestionsSignature);
      injected.setSelectedSuggestions({});
      await injected.appendWithHeaders("Applied selected suggestions.");
      onApplySuccess?.();
    } catch (err) {
      injected.setApplyError(err instanceof Error ? err.message : String(err));
    } finally {
      injected.setIsApplying(false);
    }
  }, [
    injected.latestSuggestions,
    injected.selectedSuggestions,
    injected.selectedCandidateValues,
    injected.appendWithHeaders,
    injected.setApplyError,
    injected.setIsApplying,
    injected.setSelectedSuggestions,
    onApplySuggestions,
    onApplySuccess,
    latestSuggestionsSignature,
  ]);

  const handleCancel = useCallback(() => {
    injected.setSelectedSuggestions({});
    injected.setApplyError(null);
    collapseToCompactLauncher();
  }, [
    collapseToCompactLauncher,
    injected.setApplyError,
    injected.setSelectedSuggestions,
  ]);

  useEffect(() => {
    if (injected.latestSuggestions.length === 0) {
      setAppliedSuggestions([]);
      setDismissedSuggestionsSignature(null);
      return;
    }
    if (dismissedSuggestionsSignature === latestSuggestionsSignature) {
      return;
    }
    setDismissedSuggestionsSignature(null);
  }, [
    dismissedSuggestionsSignature,
    latestSuggestionsSignature,
    injected.latestSuggestions.length,
  ]);

  useEffect(() => {
    if (injected.latestSuggestions.length === 0) {
      return;
    }
    if (dismissedSuggestionsSignature === latestSuggestionsSignature) {
      return;
    }
    setAppliedSuggestions([]);
  }, [
    dismissedSuggestionsSignature,
    latestSuggestionsSignature,
    injected.latestSuggestions.length,
  ]);

  return {
    appliedSuggestions,
    handleApplySuggestions,
    handleCancel,
    shouldHideSuggestionsReview,
  };
}
