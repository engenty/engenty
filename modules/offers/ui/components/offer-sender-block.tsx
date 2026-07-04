import type { CompanyProfileSettings } from "@engenty/company-profile/ui";
import { useTranslation } from "@engenty/i18n/ui";

interface OfferSenderBlockProps {
  companyProfile: CompanyProfileSettings | null;
  fallbackName?: string | null;
}

function formatAddress(profile: CompanyProfileSettings): string | null {
  const parts: string[] = [];
  if (profile.address_street?.trim()) {
    parts.push(profile.address_street.trim());
  }
  const location = [
    profile.address_zip,
    profile.address_city,
    profile.address_country,
  ]
    .filter(Boolean)
    .join(", ");
  if (location) {
    parts.push(location);
  }
  return parts.length > 0 ? parts.join("\n") : null;
}

export function OfferSenderBlock({
  companyProfile,
  fallbackName,
}: OfferSenderBlockProps) {
  const { t } = useTranslation("offers");

  const companyName =
    companyProfile?.name?.trim() ??
    companyProfile?.brand_name?.trim() ??
    fallbackName?.trim() ??
    null;
  const address = companyProfile ? formatAddress(companyProfile) : null;
  const hasContactInfo = [
    companyProfile?.email,
    companyProfile?.phone,
    companyProfile?.vat_id,
  ].some(Boolean);
  const showFullBlock = Boolean(companyName || address || hasContactInfo);
  const logoUrl = companyProfile?.logo_url?.trim() || null;

  if (!showFullBlock) {
    return (
      <div className="space-y-1 text-right">
        {logoUrl && (
          <div className="mb-2 flex justify-end">
            <img
              alt=""
              className="h-12 object-contain object-right"
              height={48}
              src={logoUrl}
              width={120}
            />
          </div>
        )}
        <p className="font-semibold text-base text-foreground">
          {fallbackName ?? t("senderCompanyFallback")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1 text-right">
      {logoUrl && (
        <div className="mb-2 flex justify-end">
          <img
            alt=""
            className="h-12 object-contain object-right"
            height={48}
            src={logoUrl}
            width={120}
          />
        </div>
      )}
      <p className="font-semibold text-base text-foreground">
        {companyName ?? t("senderCompanyFallback")}
      </p>
      {address && (
        <p className="whitespace-pre-line text-right text-foreground text-sm">
          {address}
        </p>
      )}
      {(companyProfile?.managing_director || companyProfile?.owner) && (
        <p className="text-foreground text-sm">
          {companyProfile.managing_director ?? companyProfile.owner}
        </p>
      )}
      {companyProfile?.email && (
        <p className="text-foreground text-sm">{companyProfile.email}</p>
      )}
      {companyProfile?.phone && (
        <p className="text-foreground text-sm">{companyProfile.phone}</p>
      )}
      {companyProfile?.vat_id && (
        <p className="text-foreground text-sm">UID {companyProfile.vat_id}</p>
      )}
    </div>
  );
}
