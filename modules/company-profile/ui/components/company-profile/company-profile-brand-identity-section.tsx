import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Card,
  FieldRow,
  FieldRowDivider,
  Label,
} from "@engenty/ui-core";
import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import { Upload } from "lucide-react";
import { useRef } from "react";
import type { CompanyProfileSectionProps } from "./company-profile-form-types.js";

interface CompanyProfileBrandIdentitySectionProps
  extends CompanyProfileSectionProps {
  onLogoUpload: (file: File) => Promise<void>;
  uploadingLogo: boolean;
}

export function CompanyProfileBrandIdentitySection({
  onLogoUpload,
  settings,
  updateField,
  uploadingLogo,
}: CompanyProfileBrandIdentitySectionProps) {
  const { t } = useTranslation("company-profile");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLogoUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      await onLogoUpload(file);
    } finally {
      event.target.value = "";
    }
  };

  return (
    <section className="space-y-3">
      <div>
        <h3 className="font-semibold text-base">
          {t("sections.brandIdentity")}
        </h3>
        <p className="text-muted-foreground text-sm">
          {t("sections.brandIdentityDesc")}
        </p>
      </div>
      <Card className="p-0" variant="form">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <Label className="font-semibold text-base">
              {t("sections.logo")}
            </Label>
            <p className="text-muted-foreground text-sm">
              {t("sections.logoUploadDesc")}
            </p>
            {settings.logo_url ? (
              <img
                alt={t("sections.logo")}
                className="mt-2 h-12 rounded border object-contain"
                height={48}
                src={settings.logo_url}
                width={96}
              />
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button
              disabled={uploadingLogo}
              onClick={() => fileInputRef.current?.click()}
              size="sm"
              variant="outline"
            >
              <Upload className="mr-2 h-4 w-4" />
              {uploadingLogo ? t("saving") : t("sections.uploadLogo")}
            </Button>
            <input
              accept="image/*"
              className="hidden"
              onChange={(event) => void handleLogoUpload(event)}
              ref={fileInputRef}
              title="Upload logo"
              type="file"
            />
            {uploadingLogo ? (
              <AnimatedLoaderIcon
                className="shrink-0"
                play="always"
                size="sm"
              />
            ) : null}
          </div>
        </div>
        <FieldRowDivider />
        <FieldRow
          desc={t("sections.brandNameDesc")}
          id="brand-name"
          label={t("sections.brandName")}
          onChange={(value) => updateField("brand_name", value)}
          value={settings.brand_name ?? ""}
        />
        <FieldRowDivider />
        <FieldRow
          desc={t("sections.tagLineDesc")}
          id="tag-line"
          label={t("sections.tagLine")}
          onChange={(value) => updateField("tag_line", value)}
          value={settings.tag_line ?? ""}
        />
      </Card>
    </section>
  );
}
