import { useTranslation } from "@engenty/i18n/ui";
import { Badge } from "@engenty/ui-core";
import type { TenantStatus, TenantTier } from "@/lib/api/tenants";

export function TierBadge({ tier }: { tier: TenantTier }) {
  const { t } = useTranslation("common");
  return (
    <Badge variant={tier === "satellite" ? "default" : "secondary"}>
      {t(`tenants.tier.${tier}`)}
    </Badge>
  );
}

export function StatusBadge({ status }: { status: TenantStatus }) {
  const { t } = useTranslation("common");
  const variant = status === "active" ? "secondary" : "outline";
  return <Badge variant={variant}>{t(`tenants.status.${status}`)}</Badge>;
}
