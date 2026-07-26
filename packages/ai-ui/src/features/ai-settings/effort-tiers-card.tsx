// Primary tenant control on the models tab: which effort tiers this workspace
// may buy. Model ids live one level down, behind the expert toggle — a tenant
// admin should be able to govern AI spend without holding an opinion about
// `openai/gpt-5-mini`.

import { AI_EFFORT_LEVELS, type AiEffort } from "@engenty/ai-core/browser";
import { Button, SettingsFormSection } from "@engenty/ui-core";
import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import { Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  useSaveTenantUsagePolicyMutation,
  useTenantUsagePolicyQuery,
} from "../../lib/admin/ai-settings-queries";

interface EffortTiersCardProps {
  t: (key: string, opts?: Record<string, unknown>) => string;
}

function normalize(allowed: readonly string[] | null | undefined): AiEffort[] {
  const known = (allowed ?? []).filter((value): value is AiEffort =>
    (AI_EFFORT_LEVELS as readonly string[]).includes(value)
  );
  // Empty means "no restriction" on the wire; show that as every tier selected,
  // which is what it means to the people using the workspace.
  return known.length > 0 ? [...known] : [...AI_EFFORT_LEVELS];
}

export function EffortTiersCard({ t }: EffortTiersCardProps) {
  const policyQuery = useTenantUsagePolicyQuery();
  const saveMutation = useSaveTenantUsagePolicyMutation();
  const server = policyQuery.data;
  // Plan-governed policies are read-only here; the platform operator changes
  // them through the manage app (same rule as the limits tab).
  const managed = server?.managed_by === "entitlement";

  const [selected, setSelected] = useState<AiEffort[]>([...AI_EFFORT_LEVELS]);

  useEffect(() => {
    if (server) {
      setSelected(normalize(server.allowed_efforts));
    }
  }, [server]);

  const dirty = useMemo(() => {
    if (!server) {
      return false;
    }
    return selected.join(",") !== normalize(server.allowed_efforts).join(",");
  }, [selected, server]);

  const toggle = (effort: AiEffort) => {
    setSelected((prev) => {
      if (!prev.includes(effort)) {
        return AI_EFFORT_LEVELS.filter(
          (level) => level === effort || prev.includes(level)
        );
      }
      // Never let the last tier go: a workspace with no licensed effort has no
      // way to run anything, and the write boundary would reject it anyway.
      return prev.length === 1
        ? prev
        : prev.filter((level) => level !== effort);
    });
  };

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
          {managed ? (
            <p className="text-muted-foreground text-xs">
              {t("effort.tiers.managedNote")}
            </p>
          ) : null}

          <div className="flex flex-col gap-2">
            {AI_EFFORT_LEVELS.map((effort) => {
              const active = selected.includes(effort);
              return (
                <label
                  className="flex cursor-pointer items-start gap-3 rounded-md border p-3"
                  key={effort}
                >
                  <input
                    checked={active}
                    className="mt-0.5 size-4"
                    disabled={managed}
                    onChange={() => toggle(effort)}
                    type="checkbox"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-sm">
                      {t(`effort.choice.${effort}.label`)}
                    </span>
                    <span className="mt-0.5 block text-muted-foreground text-xs">
                      {t(`effort.choice.${effort}.desc`)}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>

          <p className="text-muted-foreground text-xs">
            {t("effort.tiers.keepOne")}
          </p>

          {managed ? null : (
            <div>
              <Button
                className="gap-1.5"
                disabled={!dirty || saveMutation.isPending}
                onClick={() =>
                  saveMutation.mutate({
                    allowed_efforts:
                      selected.length === AI_EFFORT_LEVELS.length
                        ? null
                        : selected,
                  })
                }
                size="sm"
                type="button"
                variant={dirty ? "default" : "outline"}
              >
                {saveMutation.isPending ? (
                  <AnimatedLoaderIcon play="always" size="xs" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                {t("effort.tiers.save")}
              </Button>
            </div>
          )}
        </>
      )}
    </SettingsFormSection>
  );
}
