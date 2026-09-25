import {
  AGENT_APPROVAL_MODES,
  parseAgentApprovalMode,
} from "@engenty/ai-core/browser";
import {
  Badge,
  Button,
  Input,
  Label,
  SettingsFormSection,
  Switch,
} from "@engenty/ui-core";
import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import { Plus, Save, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AiConfig } from "../../lib/admin/ai-settings-api";
import {
  useSaveTenantUsagePolicyMutation,
  useTenantUsagePolicyQuery,
} from "../../lib/admin/ai-settings-queries";
import type { EffectiveAiSettings } from "../../lib/admin/effective-ai-settings-api";
import type { UsageEnforcementMode } from "../../lib/admin/usage-policy-api";

const MICROS_PER_DOLLAR = 1_000_000;

function microsToDollarInput(micros: number | null | undefined): string {
  if (micros == null) {
    return "";
  }
  return String(micros / MICROS_PER_DOLLAR);
}

function dollarInputToMicros(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  const dollars = Number.parseFloat(trimmed);
  if (!Number.isFinite(dollars) || dollars < 0) {
    return null;
  }
  return Math.round(dollars * MICROS_PER_DOLLAR);
}

interface LimitsBudgetsTabProps {
  effective: EffectiveAiSettings | undefined;
  /** PRO org-governance panels (model allow-list) render only when true. */
  governancePro?: boolean;
  settings: AiConfig;
  t: (key: string, opts?: Record<string, unknown>) => string;
  updateSettings: <K extends keyof AiConfig>(
    key: K,
    value: AiConfig[K]
  ) => void;
}

export function LimitsBudgetsTab({
  settings,
  effective,
  governancePro = true,
  t,
  updateSettings,
}: LimitsBudgetsTabProps) {
  const policyQuery = useTenantUsagePolicyQuery();
  const saveMutation = useSaveTenantUsagePolicyMutation();
  const server = policyQuery.data;
  // Centrally governed by the tenant's plan → read-only here. The values still
  // render (transparency) but the tenant admin cannot edit them; changes come
  // from the platform operator via the manage app.
  const managed = server?.managed_by === "entitlement";

  const [enforcement, setEnforcement] =
    useState<UsageEnforcementMode>("observe");
  const [softInput, setSoftInput] = useState("");
  const [hardInput, setHardInput] = useState("");
  const [allowed, setAllowed] = useState<string[]>([]);
  const [newModel, setNewModel] = useState("");

  // Seed local edit state whenever the server policy loads or changes.
  useEffect(() => {
    if (!server) {
      return;
    }
    setEnforcement(server.enforcement_mode);
    setSoftInput(microsToDollarInput(server.soft_limit_cost_micros));
    setHardInput(microsToDollarInput(server.hard_limit_cost_micros));
    setAllowed(server.allowed_models ?? []);
  }, [server]);

  const dirty = useMemo(() => {
    if (!server) {
      return false;
    }
    return (
      enforcement !== server.enforcement_mode ||
      dollarInputToMicros(softInput) !==
        (server.soft_limit_cost_micros ?? null) ||
      dollarInputToMicros(hardInput) !==
        (server.hard_limit_cost_micros ?? null) ||
      allowed.join(",") !== (server.allowed_models ?? []).join(",")
    );
  }, [server, enforcement, softInput, hardInput, allowed]);

  const handleSavePolicy = () => {
    saveMutation.mutate({
      enforcement_mode: enforcement,
      soft_limit_cost_micros: dollarInputToMicros(softInput),
      hard_limit_cost_micros: dollarInputToMicros(hardInput),
      allowed_models: allowed.length > 0 ? allowed : null,
    });
  };

  const addModel = () => {
    const id = newModel.trim();
    if (id && !allowed.includes(id)) {
      setAllowed((prev) => [...prev, id]);
    }
    setNewModel("");
  };

  const capsSteps = settings.caps?.max_steps ?? null;
  const inheritedSteps = effective?.caps.max_steps.inherited.value;
  const approvalMode = settings.agent_approval?.mode ?? "auto";
  const approvalHintKey =
    approvalMode === "pass-all"
      ? "limits.approval.passAllHint"
      : approvalMode === "auto"
        ? "limits.approval.autoHint"
        : "limits.approval.manualHint";

  return (
    <div className="space-y-6">
      {managed ? (
        <div
          className="rounded-md border border-primary/30 bg-primary/5 px-4 py-3 text-sm"
          role="status"
        >
          <p className="font-medium text-foreground">
            {t("limits.managedTitle")}
          </p>
          <p className="mt-0.5 text-muted-foreground text-xs">
            {t("limits.managedDesc")}
          </p>
        </div>
      ) : null}
      <SettingsFormSection
        description={t("limits.approvalDesc")}
        title={t("limits.approvalTitle")}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="agent-approval-mode">
            {t("limits.approvalMode")}
          </Label>
          <select
            className="h-8 w-fit rounded-md border bg-background px-2 text-sm"
            id="agent-approval-mode"
            onChange={(e) =>
              updateSettings("agent_approval", {
                mode: parseAgentApprovalMode(e.target.value) ?? "manual",
                agents: settings.agent_approval?.agents ?? null,
              })
            }
            value={approvalMode}
          >
            {AGENT_APPROVAL_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {t(
                  mode === "pass-all"
                    ? "limits.approval.passAll"
                    : `limits.approval.${mode}`
                )}
              </option>
            ))}
          </select>
          <p className="text-muted-foreground text-xs">{t(approvalHintKey)}</p>
        </div>
      </SettingsFormSection>
      <SettingsFormSection
        description={t("limits.generatedStartersDesc")}
        title={t("limits.generatedStartersTitle")}
      >
        <div className="flex items-center gap-3">
          <Switch
            checked={settings.generated_starters === true}
            id="generated-starters"
            onCheckedChange={(checked) =>
              updateSettings("generated_starters", checked === true)
            }
          />
          <Label
            className="cursor-pointer font-normal"
            htmlFor="generated-starters"
          >
            {t("limits.generatedStartersLabel")}
          </Label>
        </div>
        <p className="text-muted-foreground text-xs">
          {t("limits.generatedStartersHint")}
        </p>
      </SettingsFormSection>
      <SettingsFormSection
        description={t("limits.enforcementDesc")}
        title={t("limits.enforcementTitle")}
      >
        {policyQuery.isError ? (
          <p className="text-destructive text-sm">{t("limits.loadError")}</p>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <Label>{t("limits.enforcementMode")}</Label>
              <div className="inline-flex w-fit overflow-hidden rounded-md border">
                {(["observe", "enforce"] as const).map((mode) => (
                  <Button
                    className="h-8 rounded-none border-0 px-4 text-xs"
                    disabled={managed}
                    key={mode}
                    onClick={() => setEnforcement(mode)}
                    size="sm"
                    type="button"
                    variant={enforcement === mode ? "default" : "ghost"}
                  >
                    {t(`limits.mode.${mode}`)}
                  </Button>
                ))}
              </div>
              <p className="text-muted-foreground text-xs">
                {enforcement === "enforce"
                  ? t("limits.mode.enforceHint")
                  : t("limits.mode.observeHint")}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="soft-limit">{t("limits.softLimit")}</Label>
                <Input
                  className="h-8"
                  disabled={managed}
                  id="soft-limit"
                  inputMode="decimal"
                  onChange={(e) => setSoftInput(e.target.value)}
                  placeholder="—"
                  value={softInput}
                />
                <p className="text-muted-foreground text-xs">
                  {t("limits.softLimitHint")}
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="hard-limit">{t("limits.hardLimit")}</Label>
                <Input
                  className="h-8"
                  disabled={managed}
                  id="hard-limit"
                  inputMode="decimal"
                  onChange={(e) => setHardInput(e.target.value)}
                  placeholder="—"
                  value={hardInput}
                />
                <p className="text-muted-foreground text-xs">
                  {t("limits.hardLimitHint")}
                </p>
              </div>
            </div>

            <div>
              <Button
                className="gap-1.5"
                disabled={managed || !dirty || saveMutation.isPending}
                onClick={handleSavePolicy}
                size="sm"
                type="button"
                variant={dirty ? "default" : "outline"}
              >
                {saveMutation.isPending ? (
                  <AnimatedLoaderIcon play="always" size="xs" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                {t("limits.savePolicy")}
              </Button>
            </div>
          </>
        )}
      </SettingsFormSection>

      <SettingsFormSection
        description={t("limits.iterationCapDesc")}
        title={t("limits.iterationCapTitle")}
      >
        <div className="flex flex-col gap-1.5 sm:max-w-xs">
          <Label htmlFor="iteration-cap">{t("limits.iterationCap")}</Label>
          <Input
            className="h-8"
            id="iteration-cap"
            inputMode="numeric"
            onChange={(e) => {
              const raw = e.target.value.trim();
              const parsed = raw ? Number.parseInt(raw, 10) : null;
              updateSettings(
                "caps",
                parsed && parsed > 0 ? { max_steps: parsed } : null
              );
            }}
            placeholder={
              inheritedSteps == null
                ? undefined
                : t("matrix.inheritHint", { model: String(inheritedSteps) })
            }
            value={capsSteps == null ? "" : String(capsSteps)}
          />
          <p className="text-muted-foreground text-xs">
            {t("limits.iterationCapHint")}
          </p>
        </div>
      </SettingsFormSection>

      {governancePro ? (
        <SettingsFormSection
          description={t("limits.allowlistDesc")}
          title={
            <span className="flex items-center gap-2">
              {t("limits.allowlistTitle")}
              <Badge variant="secondary">{t("limits.pro")}</Badge>
            </span>
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            {allowed.length === 0 ? (
              <span className="text-muted-foreground text-sm">
                {t("limits.allowlistEmpty")}
              </span>
            ) : (
              allowed.map((model) => (
                <Badge
                  className="gap-1 font-mono"
                  key={model}
                  variant="outline"
                >
                  {model}
                  {managed ? null : (
                    <button
                      aria-label={t("limits.allowlistRemove", { model })}
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() =>
                        setAllowed((prev) => prev.filter((m) => m !== model))
                      }
                      type="button"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </Badge>
              ))
            )}
          </div>
          {managed ? null : (
            <>
              <div className="flex items-center gap-2">
                <Input
                  className="h-8 sm:max-w-xs"
                  onChange={(e) => setNewModel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addModel();
                    }
                  }}
                  placeholder="provider/model"
                  value={newModel}
                />
                <Button
                  className="gap-1"
                  onClick={addModel}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t("limits.allowlistAdd")}
                </Button>
              </div>
              <div>
                <Button
                  className="gap-1.5"
                  disabled={!dirty || saveMutation.isPending}
                  onClick={handleSavePolicy}
                  size="sm"
                  type="button"
                  variant={dirty ? "default" : "outline"}
                >
                  <Save className="h-3.5 w-3.5" />
                  {t("limits.savePolicy")}
                </Button>
              </div>
            </>
          )}
        </SettingsFormSection>
      ) : null}
    </div>
  );
}
