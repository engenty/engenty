import type { CompanyProfileSettings } from "../../api.js";

export interface CompanyProfileSectionProps {
  settings: CompanyProfileSettings;
  updateField: (
    key: keyof CompanyProfileSettings,
    value: string | null
  ) => void;
}
