/**
 * Composer pill for this space's agent-approval level.
 *
 * Orthogonal to effort (how hard the model thinks). This is how cautious the
 * space is about asking a human before a capable agent acts — the same three
 * modes Space settings already persist. An explicit pick replaces the tenant
 * default in either direction; unset inherits.
 */
import { useEffectiveAiSettingsQuery } from "@engenty/ai-ui";
import { useTranslation } from "@engenty/i18n/ui";
import {
  AGENT_APPROVAL_MODES,
  type AgentApprovalMode,
  parseAgentApprovalMode,
} from "@engenty/plugin-sdk";
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
import { useState } from "react";
import { toast } from "sonner";
import type { Space } from "@/lib/api/spaces-client";
import {
  useSaveSpaceSetupMutation,
  useSpaceMountsQuery,
} from "@/lib/spaces-queries";

const MODE_ICON: Record<AgentApprovalMode, typeof Shield> = {
  auto: ShieldCheck,
  manual: Shield,
  "pass-all": ShieldOff,
};

function modeLabelKey(mode: AgentApprovalMode) {
  return mode === "pass-all"
    ? "spaces.settings.approval.passAll"
    : `spaces.settings.approval.${mode}`;
}

function modeHintKey(mode: AgentApprovalMode) {
  return mode === "pass-all"
    ? "spaces.settings.approval.passAllHint"
    : `spaces.settings.approval.${mode}Hint`;
}

function ApprovalModeRow({
  hint,
  icon: Icon,
  label,
}: {
  hint?: string;
  icon: typeof Shield;
  label: string;
}) {
  return (
    <>
      <Icon aria-hidden className="mt-0.5 size-3.5 shrink-0 opacity-70" />
      <div className="min-w-0 flex-1">
        <span className="leading-tight">{label}</span>
        {hint ? (
          <p className="mt-0.5 text-muted-foreground text-xs leading-snug">
            {hint}
          </p>
        ) : null}
      </div>
    </>
  );
}

export function SpaceApprovalModeControl({ space }: { space: Space }) {
  const { t } = useTranslation("common");
  const { isSuperAdmin, isTenantAdmin } = useWorkspaceContext();
  const canEdit = isSuperAdmin || isTenantAdmin || space.ownerUserId != null;
  const mountsQuery = useSpaceMountsQuery(space.id);
  const effectiveQuery = useEffectiveAiSettingsQuery();
  const save = useSaveSpaceSetupMutation();
  const [open, setOpen] = useState(false);
  const value = space.agentApprovalMode ?? "";
  // What "Default" actually resolves to. A space owner may not be allowed to
  // read tenant settings — then the inherit row stays unnamed.
  const tenantMode = effectiveQuery.data?.agent_approval.mode.value ?? null;
  const ActiveIcon = value
    ? MODE_ICON[value]
    : tenantMode
      ? MODE_ICON[tenantMode]
      : Shield;
  const inheritLabel = tenantMode
    ? t("spaces.home.approvalInheritNamed", {
        defaultValue: "Default: {{level}}",
        level: t(modeLabelKey(tenantMode)),
      })
    : t("spaces.home.approvalInheritShort", {
        defaultValue: "Default",
      });
  const label = value ? t(modeLabelKey(value)) : inheritLabel;
  const selectedHintMode: AgentApprovalMode | null = value ? value : tenantMode;

  const setMode = (next: string) => {
    setOpen(false);
    if (!canEdit || mountsQuery.isPending || !mountsQuery.data) {
      return;
    }
    const parsed = next ? parseAgentApprovalMode(next) : null;
    save.mutate(
      {
        color: space.color,
        icon: space.icon,
        mounts: mountsQuery.data.map((mount) => ({
          resource_key: mount.resourceKey,
          resource_type: mount.resourceType,
          ...(mount.agentAccess ? { agent_access: mount.agentAccess } : {}),
          ...(mount.recordScope ? { record_scope: mount.recordScope } : {}),
        })),
        name: space.name,
        spaceId: space.id,
        ...(space.ownerUserId ? {} : { visibility: space.visibility }),
        agent_approval_mode: parsed,
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
    <DropdownMenu onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger
        aria-label={t("spaces.home.approvalAria", {
          defaultValue: "Approval level for this space",
        })}
        className="flex h-6 items-center gap-1 rounded-full border-0 bg-transparent px-2 text-muted-foreground text-xs shadow-none outline-none transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!canEdit || mountsQuery.isPending}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <ActiveIcon aria-hidden className="size-3.5 shrink-0 opacity-70" />
          <span className="truncate">{label}</span>
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
          <DropdownMenuRadioItem className="items-start py-2" value="">
            <ApprovalModeRow
              hint={
                value === "" && selectedHintMode
                  ? t(modeHintKey(selectedHintMode))
                  : undefined
              }
              icon={tenantMode ? MODE_ICON[tenantMode] : Shield}
              label={inheritLabel}
            />
          </DropdownMenuRadioItem>
          {AGENT_APPROVAL_MODES.map((mode) => (
            <DropdownMenuRadioItem
              className="items-start py-2"
              key={mode}
              value={mode}
            >
              <ApprovalModeRow
                hint={value === mode ? t(modeHintKey(mode)) : undefined}
                icon={MODE_ICON[mode]}
                label={t(modeLabelKey(mode))}
              />
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
