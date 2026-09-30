// The tenant's one effort control on the models tab: whether people here may
// use Extra. Normal is always on. A tenant can only narrow what its plan
// grants — a plan-governed policy shows read-only, and the service clamps any
// request to the plan anyway.

import { Label, SettingsFormSection, Switch } from "@engenty/ui-core";
import {
  useSaveTenantUsagePolicyMutation,
  useTenantUsagePolicyQuery,
} from "../../lib/admin/ai-settings-queries";
import { isExtraAllowed } from "../ai-effort/chat-mode";

interface EffortTiersCardProps {
  t: (key: string, opts?: Record<string, unknown>) => string;
}

export function EffortTiersCard({ t }: EffortTiersCardProps) {
  const policyQuery = useTenantUsagePolicyQuery();
  const saveMutation = useSaveTenantUsagePolicyMutation();
  const server = policyQuery.data;
  // Plan-governed policies are read-only here; the platform operator changes
  // them through the manage app (same rule as the limits tab).
  const managed = server?.managed_by === "entitlement";
  const extraAllowed = isExtraAllowed(server?.allowed_efforts);

  return (
    <SettingsFormSection
      description={t("effort.tiers.description")}
      title={t("effort.tiers.title")}
    >
      {policyQuery.isError ? (
        <p className="text-destructive text-sm">
          {t("effort.tiers.loadError")}
        </p>
      ) : (
        <>
          <div className="flex items-start gap-3">
            <Switch
              checked={extraAllowed}
              disabled={managed || !server || saveMutation.isPending}
              id="ai-settings-extra-allowed"
              onCheckedChange={(checked) =>
                // null = no restriction (Normal and Extra); ["normal"] = no Extra.
                saveMutation.mutate({
                  allowed_efforts: checked ? null : ["normal"],
                })
              }
            />
            <Label
              className="flex min-w-0 flex-1 cursor-pointer flex-col items-start gap-0.5"
              htmlFor="ai-settings-extra-allowed"
            >
              <span className="font-medium text-sm">
                {t("effort.tiers.extraAllowed")}
              </span>
              <span className="font-normal text-muted-foreground text-xs">
                {t("effort.tiers.extraAllowedHint")}
              </span>
            </Label>
          </div>
          {managed ? (
            <p className="text-muted-foreground text-xs">
              {t("effort.tiers.managedNote")}
            </p>
          ) : null}
        </>
      )}
    </SettingsFormSection>
  );
}
