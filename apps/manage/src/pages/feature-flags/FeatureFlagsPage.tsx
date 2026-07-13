import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@engenty/ui-core";
import { useState } from "react";
import { PageShell } from "@/components/PageShell";
import { FeatureFlagsEditor } from "@/features/feature-flags/FeatureFlagsEditor";
import { tenantsQuery } from "@/lib/queries/tenants";

const GLOBAL = "__global__";

export function FeatureFlagsPage() {
  const { t } = useTranslation("common");
  const tenants = useQuery(tenantsQuery);
  const [scope, setScope] = useState<string>(GLOBAL);
  const tenantId = scope === GLOBAL ? undefined : scope;

  return (
    <PageShell
      actions={
        <Select onValueChange={setScope} value={scope}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder={t("featureFlags.selectTenant")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={GLOBAL}>
              {t("featureFlags.globalScope")}
            </SelectItem>
            {(tenants.data ?? []).map((tenant) => (
              <SelectItem key={tenant.id} value={tenant.id}>
                {tenant.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
      breadcrumbs={[{ label: t("featureFlags.title") }]}
      title={t("featureFlags.title")}
    >
      <FeatureFlagsEditor key={tenantId ?? GLOBAL} tenantId={tenantId} />
    </PageShell>
  );
}
