import type { CompanyProfileSettings, CompanyType } from "../api.js";

export type CompanyProfilePatch = Record<string, string | null>;

export const EMPTY_SELECT_VALUE = "__none__";

export const COMPANY_TYPE_OPTIONS: { value: CompanyType; labelKey: string }[] =
  [
    {
      value: "sole_proprietorship",
      labelKey: "sections.companyTypeSoleProprietorship",
    },
    { value: "company", labelKey: "sections.companyTypeCompany" },
    { value: "association", labelKey: "sections.companyTypeAssociation" },
    { value: "public", labelKey: "sections.companyTypePublic" },
  ];

function normalizeValue(
  key: keyof CompanyProfileSettings,
  value: string | null
): string | null {
  if (value === null || value === "") {
    return key === "company_type" ? null : "";
  }

  return value;
}

export function updateCompanyProfileField(
  draft: CompanyProfileSettings,
  key: keyof CompanyProfileSettings,
  value: string | null
): CompanyProfileSettings {
  return {
    ...draft,
    [key]: normalizeValue(key, value),
  };
}

export function applyCompanyProfilePatch(
  draft: CompanyProfileSettings,
  patch: CompanyProfilePatch
): CompanyProfileSettings {
  return Object.entries(patch).reduce<CompanyProfileSettings>(
    (nextDraft, entry) => {
      const [field, value] = entry;
      return updateCompanyProfileField(
        nextDraft,
        field as keyof CompanyProfileSettings,
        value
      );
    },
    draft
  );
}
