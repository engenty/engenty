/**
 * Composer pill for the copilot's own approval level.
 *
 * The mode is bound to the agent: the copilot's entry in the tenant's
 * `agent_approval.agents` decides over the space and tenant mode; unset, its
 * platform default (`auto`) applies. Beside effort, like a space desk's pill.
 */
import {
  AGENT_APPROVAL_MODES,
  type AgentApprovalMode,
  DEFAULT_AGENT_APPROVAL_MODES,
  parseAgentApprovalMode,
} from "@engenty/ai-core/browser";
import { useAiSettingsQuery, useSaveAiSettingsMutation } from "@engenty/ai-ui";
import { useTranslation } from "@engenty/i18n/ui";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@engenty/ui-core";
import { useWorkspaceContext } from "@engenty/ui-plugin-sdk";
import { ChevronDown, Shield, ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";

const COPILOT_AGENT_ID = "engenty.copilot";

const MODE_ICON: Record<AgentApprovalMode, typeof Shield> = {
  auto: ShieldCheck,
  manual: Shield,
  "pass-all": ShieldOff,
};

function modeKey(mode: AgentApprovalMode, suffix = "") {
  return `spaces.settings.approval.${mode === "pass-all" ? "passAll" : mode}${suffix}`;
}

export function CopilotApprovalModeControl() {
  const { t } = useTranslation("common");
  const { isSuperAdmin, isTenantAdmin } = useWorkspaceContext();
  // The mode lives in the tenant's AI settings, which only admins write.
  const canEdit = isSuperAdmin || isTenantAdmin;
  const settingsQuery = useAiSettingsQuery();
  const save = useSaveAiSettingsMutation();
  const settings = settingsQuery.data;
  const current = settings?.agent_approval ?? { agents: null, mode: null };
  const value: AgentApprovalMode =
    parseAgentApprovalMode(current.agents?.[COPILOT_AGENT_ID]) ??
    DEFAULT_AGENT_APPROVAL_MODES[COPILOT_AGENT_ID] ??
    "manual";
  const ActiveIcon = MODE_ICON[value];

  const setMode = (next: string) => {
    const mode = parseAgentApprovalMode(next);
    if (!(settings && canEdit && mode) || mode === value) {
      return;
    }
    save.mutate(
      {
        ...settings,
        agent_approval: {
          agents: { ...(current.agents ?? {}), [COPILOT_AGENT_ID]: mode },
          mode: current.mode ?? null,
        },
      },
      {
        onError: () => {
          toast.error(
            t("spaces.settings.saveFailed", {
              defaultValue: "Could not save. Try again.",
            })
          );
        },
      }
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("spaces.home.approvalMenuTitle", {
          defaultValue: "Approval level",
        })}
        className="flex h-6 items-center gap-1 rounded-full border-0 bg-transparent px-2 text-muted-foreground text-xs shadow-none outline-none transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!(canEdit && settings) || save.isPending}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <ActiveIcon aria-hidden className="size-3.5 shrink-0 opacity-70" />
          <span className="truncate">{t(modeKey(value))}</span>
        </span>
        <ChevronDown aria-hidden className="size-3 shrink-0 opacity-70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>
          {t("spaces.home.approvalMenuTitle", {
            defaultValue: "Approval level",
          })}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup onValueChange={setMode} value={value}>
          {AGENT_APPROVAL_MODES.map((mode) => {
            const Icon = MODE_ICON[mode];
            return (
              <DropdownMenuRadioItem
                className="items-start py-2"
                key={mode}
                value={mode}
              >
                <Icon
                  aria-hidden
                  className="mt-0.5 size-3.5 shrink-0 opacity-70"
                />
                <div className="min-w-0 flex-1">
                  <span className="leading-tight">{t(modeKey(mode))}</span>
                  {value === mode ? (
                    <p className="mt-0.5 text-muted-foreground text-xs leading-snug">
                      {t(modeKey(mode, "Hint"))}
                    </p>
                  ) : null}
                </div>
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
