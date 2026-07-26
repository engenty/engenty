import type { AiEffortChoice } from "@engenty/ai-core/browser";
import {
  Badge,
  Button,
  Input,
  Label,
  SearchableSelect,
  type SearchableSelectOption,
  SettingsFormSection,
  Switch,
} from "@engenty/ui-core";
import { useState } from "react";
import {
  useAiAgentsQuery,
  usePatchAiAgentOverridesMutation,
} from "../../lib/admin/ai-runtime-queries";
import type { AiRegisteredAgent } from "../../lib/admin/ai-runtime-types";
import type { EffectiveAiSettings } from "../../lib/admin/effective-ai-settings-api";
import { EffortSelector } from "../ai-effort/effort-selector";
import { useEffortGrant } from "../ai-effort/use-effort-grant";

const MICROS_PER_DOLLAR = 1_000_000;

const PURPOSE_VALUES = [
  "",
  "chat",
  "routing",
  "research",
  "planning_coding",
  "safeguard",
] as const;

interface Draft {
  budgetDollars: string;
  effort: AiEffortChoice;
  maxSteps: string;
  modelOverride: string;
  purpose: string;
}

function toDraft(agent: AiRegisteredAgent): Draft {
  const budgetMicros = agent.limits?.budget?.maxCostMicrosPerPeriod;
  return {
    effort: agent.effort ?? "auto",
    modelOverride: agent.modelOverride ?? "",
    purpose: agent.purpose ?? "",
    maxSteps:
      agent.limits?.max_steps == null ? "" : String(agent.limits.max_steps),
    budgetDollars:
      budgetMicros == null ? "" : String(budgetMicros / MICROS_PER_DOLLAR),
  };
}

interface AgentsOverridesTabProps {
  chatModelOptions: SearchableSelectOption[];
  effective: EffectiveAiSettings | undefined;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

export function AgentsOverridesTab({
  chatModelOptions,
  t,
}: AgentsOverridesTabProps) {
  const agentsQuery = useAiAgentsQuery();
  const saveMutation = usePatchAiAgentOverridesMutation();
  const { allowedEfforts } = useEffortGrant();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  // Model ids and the legacy purpose tier are the expert layer; effort is what
  // an admin normally sets. Sticky across rows so a self-hosted admin flips it
  // once per visit.
  const [expertModels, setExpertModels] = useState(false);

  const agents = agentsQuery.data?.agents ?? [];

  const startEdit = (agent: AiRegisteredAgent) => {
    setEditingId(agent.id);
    setDraft(toDraft(agent));
  };

  const save = (agentId: string) => {
    if (!draft) {
      return;
    }
    const maxSteps = draft.maxSteps.trim()
      ? Number.parseInt(draft.maxSteps, 10)
      : null;
    const dollars = draft.budgetDollars.trim()
      ? Number.parseFloat(draft.budgetDollars)
      : null;
    saveMutation.mutate(
      {
        agentId,
        patch: {
          effort: draft.effort === "auto" ? null : draft.effort,
          modelOverride: draft.modelOverride.trim() || null,
          purpose: (draft.purpose || null) as AiRegisteredAgent["purpose"],
          limits: {
            max_steps: maxSteps && maxSteps > 0 ? maxSteps : undefined,
            budget:
              dollars && dollars > 0
                ? {
                    maxCostMicrosPerPeriod: Math.round(
                      dollars * MICROS_PER_DOLLAR
                    ),
                  }
                : null,
          },
        },
      },
      {
        onSuccess: () => {
          setEditingId(null);
          setDraft(null);
        },
      }
    );
  };

  return (
    <SettingsFormSection
      description={t("agentsTab.description")}
      title={t("agentsTab.title")}
    >
      {agentsQuery.isError ? (
        <p className="text-destructive text-sm">{t("agentsTab.loadError")}</p>
      ) : agents.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("agentsTab.empty")}</p>
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {agents.map((agent) => {
            const editable = agent.source === "database";
            const isEditing = editingId === agent.id;
            const pinnedModel = agent.modelOverride ?? null;
            const purposeLabel = agent.purpose
              ? t(`matrix.purpose.${agent.purpose}.label`)
              : t("agentsTab.structural");

            return (
              <div
                className="flex flex-col gap-2 py-4 first:pt-0"
                key={agent.id}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-sm">{agent.name}</span>
                  {agent.source ? (
                    <Badge variant="outline">{agent.source}</Badge>
                  ) : null}
                  <span className="flex-1" />
                  {editable ? (
                    <Button
                      className="h-7 text-xs"
                      onClick={() =>
                        isEditing ? setEditingId(null) : startEdit(agent)
                      }
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      {isEditing ? t("agentsTab.cancel") : t("agentsTab.edit")}
                    </Button>
                  ) : (
                    <Badge variant="secondary">
                      {t("agentsTab.codeManaged")}
                    </Badge>
                  )}
                </div>

                {isEditing && draft ? (
                  <div className="grid gap-3 rounded-md border bg-muted/20 p-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <Label>{t("agentsTab.effort")}</Label>
                      <EffortSelector
                        allowedEfforts={allowedEfforts}
                        onChange={(effort) => setDraft({ ...draft, effort })}
                        value={draft.effort}
                        variant="field"
                      />
                    </div>
                    <div className="flex items-center gap-2 sm:justify-end">
                      <Switch
                        checked={expertModels}
                        id={`ov-expert-${agent.id}`}
                        onCheckedChange={setExpertModels}
                      />
                      <Label
                        className="cursor-pointer font-normal text-muted-foreground text-xs"
                        htmlFor={`ov-expert-${agent.id}`}
                      >
                        {t("agentsTab.expertToggle")}
                      </Label>
                    </div>
                    {expertModels ? (
                      <>
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor={`ov-model-${agent.id}`}>
                            {t("agentsTab.modelOverride")}
                          </Label>
                          <SearchableSelect
                            emptyMessage={t("fields.modelSearchEmpty")}
                            id={`ov-model-${agent.id}`}
                            onValueChange={(v) =>
                              setDraft({ ...draft, modelOverride: v })
                            }
                            options={chatModelOptions}
                            placeholder={t("agentsTab.inheritPlaceholder")}
                            searchPlaceholder={t(
                              "fields.modelSearchPlaceholder"
                            )}
                            triggerClassName="h-8 w-full"
                            value={draft.modelOverride}
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor={`ov-purpose-${agent.id}`}>
                            {t("agentsTab.purpose")}
                          </Label>
                          <select
                            className="h-8 rounded-md border bg-background px-2 text-sm"
                            id={`ov-purpose-${agent.id}`}
                            onChange={(e) =>
                              setDraft({ ...draft, purpose: e.target.value })
                            }
                            value={draft.purpose}
                          >
                            {PURPOSE_VALUES.map((p) => (
                              <option key={p || "inherit"} value={p}>
                                {p
                                  ? t(`matrix.purpose.${p}.label`)
                                  : t("agentsTab.structural")}
                              </option>
                            ))}
                          </select>
                        </div>
                      </>
                    ) : null}
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`ov-steps-${agent.id}`}>
                        {t("agentsTab.maxSteps")}
                      </Label>
                      <Input
                        className="h-8"
                        id={`ov-steps-${agent.id}`}
                        inputMode="numeric"
                        onChange={(e) =>
                          setDraft({ ...draft, maxSteps: e.target.value })
                        }
                        placeholder={t("agentsTab.inheritPlaceholder")}
                        value={draft.maxSteps}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`ov-budget-${agent.id}`}>
                        {t("agentsTab.budget")}
                      </Label>
                      <Input
                        className="h-8"
                        id={`ov-budget-${agent.id}`}
                        inputMode="decimal"
                        onChange={(e) =>
                          setDraft({ ...draft, budgetDollars: e.target.value })
                        }
                        placeholder="—"
                        value={draft.budgetDollars}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Button
                        disabled={saveMutation.isPending}
                        onClick={() => save(agent.id)}
                        size="sm"
                        type="button"
                      >
                        {t("actions.save")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-1.5 text-muted-foreground text-xs">
                    <Badge variant={agent.effort ? "default" : "secondary"}>
                      {agent.effort
                        ? t(`effort.choice.${agent.effort}.label`)
                        : t("agentsTab.inheritEffort")}
                    </Badge>
                    {pinnedModel ? (
                      <Badge className="font-mono" variant="default">
                        {pinnedModel}
                      </Badge>
                    ) : (
                      <Badge variant="secondary">
                        {t("agentsTab.inheritModel", { tier: purposeLabel })}
                      </Badge>
                    )}
                    <span>
                      {t("agentsTab.stepsLabel")}:{" "}
                      {agent.limits?.max_steps == null
                        ? t("agentsTab.inherit")
                        : agent.limits.max_steps}
                    </span>
                    <span>
                      {t("agentsTab.budgetLabel")}:{" "}
                      {agent.limits?.budget?.maxCostMicrosPerPeriod == null
                        ? t("agentsTab.none")
                        : `$${agent.limits.budget.maxCostMicrosPerPeriod / MICROS_PER_DOLLAR}`}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </SettingsFormSection>
  );
}
