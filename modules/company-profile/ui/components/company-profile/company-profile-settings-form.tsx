import type { CompanyProfileSettings } from "../../api.js";
import { CompanyProfileAddressSection } from "./company-profile-address-section.js";
import { CompanyProfileBankingSection } from "./company-profile-banking-section.js";
import { CompanyProfileBrandIdentitySection } from "./company-profile-brand-identity-section.js";
import { CompanyProfileCompanySection } from "./company-profile-company-section.js";
import { CompanyProfileContactSection } from "./company-profile-contact-section.js";
import { CompanyProfileLegalSection } from "./company-profile-legal-section.js";

interface CompanyProfileSettingsFormProps {
  onLogoUpload: (file: File) => Promise<void>;
  settings: CompanyProfileSettings;
  updateField: (
    key: keyof CompanyProfileSettings,
    value: string | null
  ) => void;
  uploadingLogo: boolean;
}

export function CompanyProfileSettingsForm({
  onLogoUpload,
  settings,
  updateField,
  uploadingLogo,
}: CompanyProfileSettingsFormProps) {
  return (
    <>
      <CompanyProfileBrandIdentitySection
        onLogoUpload={onLogoUpload}
        settings={settings}
        updateField={updateField}
        uploadingLogo={uploadingLogo}
      />
      <CompanyProfileCompanySection
        settings={settings}
        updateField={updateField}
      />
      <CompanyProfileAddressSection
        settings={settings}
        updateField={updateField}
      />
      <CompanyProfileContactSection
        settings={settings}
        updateField={updateField}
      />
      <CompanyProfileLegalSection
        settings={settings}
        updateField={updateField}
      />
      <CompanyProfileBankingSection
        settings={settings}
        updateField={updateField}
      />
    </>
  );
}
