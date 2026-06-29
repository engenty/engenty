"use client";

import { useEffect, useState } from "react";
import type { FieldSuggestion } from "../interrupts/hitl-approval-card";

export function useCopilotSuggestionsState(
  latestSuggestions: FieldSuggestion[]
) {
  const [selectedSuggestions, setSelectedSuggestions] = useState<
    Record<string, boolean>
  >({});
  const [selectedCandidateValues, setSelectedCandidateValues] = useState<
    Record<string, string | null>
  >({});
  const [applyError, setApplyError] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  useEffect(() => {
    if (latestSuggestions.length === 0) {
      setSelectedSuggestions({});
      setSelectedCandidateValues({});
      return;
    }
    setSelectedSuggestions(
      Object.fromEntries(
        latestSuggestions.map((suggestion) => [suggestion.field, true])
      )
    );
    setSelectedCandidateValues(
      Object.fromEntries(
        latestSuggestions
          .filter(
            (suggestion) =>
              suggestion.candidates && suggestion.candidates.length > 0
          )
          .map((suggestion) => [
            suggestion.field,
            suggestion.candidates![0]?.value ?? null,
          ])
      )
    );
    setApplyError(null);
  }, [latestSuggestions]);

  return {
    applyError,
    isApplying,
    selectedCandidateValues,
    selectedSuggestions,
    setApplyError,
    setIsApplying,
    setSelectedCandidateValues,
    setSelectedSuggestions,
  };
}
