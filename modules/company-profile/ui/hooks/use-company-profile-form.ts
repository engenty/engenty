import { useCallback, useMemo, useState } from "react";
import type { CompanyProfileSettings } from "../api.js";
import {
  applyCompanyProfilePatch,
  type CompanyProfilePatch,
  updateCompanyProfileField,
} from "../lib/company-profile-form.js";

export function useCompanyProfileForm(
  initialValues: CompanyProfileSettings | null | undefined
) {
  const [draft, setDraft] = useState<CompanyProfileSettings>(
    initialValues ?? {}
  );

  const resetDraft = useCallback((nextValues: CompanyProfileSettings) => {
    setDraft(nextValues);
  }, []);

  const updateField = useCallback(
    (key: keyof CompanyProfileSettings, value: string | null) => {
      setDraft((currentDraft) =>
        updateCompanyProfileField(currentDraft, key, value)
      );
    },
    []
  );

  const applyPatch = useCallback((patch: CompanyProfilePatch) => {
    setDraft((currentDraft) => applyCompanyProfilePatch(currentDraft, patch));
  }, []);

  const hasChanges = useMemo(() => {
    if (!initialValues) {
      return false;
    }

    return JSON.stringify(draft) !== JSON.stringify(initialValues);
  }, [draft, initialValues]);

  return {
    draft,
    setDraft,
    resetDraft,
    updateField,
    applyPatch,
    hasChanges,
  };
}
