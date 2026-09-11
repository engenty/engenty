import { useTranslation } from "@engenty/i18n/ui";
import {
  Avatar,
  AvatarFallback,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Label,
  MultiSelect,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@engenty/ui-core";
import { Bot, Check, ChevronDown, UserMinus } from "lucide-react";
import { useMemo, useState } from "react";
import type { PrimaryAssigneeKind } from "../../src/schema/types.js";
import { useAgentCatalogQuery } from "../hooks/use-agent-catalog-query.js";
import { resolveTaskAssigneeLabel } from "../lib/format-assignee.js";
import { buildTaskAssigneeMemberOptions } from "../lib/team-catalog-ui.js";
import {
  buildAssigneeProfileMap,
  type TeamMemberCatalogRow,
} from "../plugins.js";

export interface TaskAssigneeValue {
  collaborator_user_ids: string[];
  primary_assignee_agent_type_key: string | null;
  primary_assignee_kind: PrimaryAssigneeKind;
  primary_assignee_user_id: string | null;
}

interface TaskAssigneePickerProps {
  catalog: TeamMemberCatalogRow[];
  disabled?: boolean;
  loading?: boolean;
  onChange: (value: TaskAssigneeValue) => void;
  teamMembersEnabled?: boolean;
  value: TaskAssigneeValue;
}

export function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function resolvePrimaryAssigneeProfile(
  value: TaskAssigneeValue,
  assigneeProfiles: Map<string, { full_name: string; id: string }>
) {
  if (value.primary_assignee_kind !== "user") {
    return null;
  }
  const userId = value.primary_assignee_user_id;
  if (!userId) {
    return null;
  }
  return assigneeProfiles.get(userId) ?? { id: userId, full_name: userId };
}

interface UnifiedAssigneeSelectorProps {
  agentOptions: Array<{ value: string; label: string }>;
  catalog: TeamMemberCatalogRow[];
  onChange: (value: TaskAssigneeValue) => void;
  onSelect?: () => void;
  /**
   * Say that picking an agent dispatches. True on an EXISTING task, where the
   * choice IS the dispatch; false in create dialogs, where "start now / plan
   * only" decides and the wizard already carries that sentence.
   */
  showAgentDispatchHint?: boolean;
  teamMembersEnabled?: boolean;
  value: TaskAssigneeValue;
}

export function UnifiedAssigneeSelector({
  catalog,
  agentOptions,
  value,
  onChange,
  teamMembersEnabled = false,
  showAgentDispatchHint = false,
  onSelect,
}: UnifiedAssigneeSelectorProps) {
  const { t } = useTranslation("tasks");
  const memberOptions = useMemo(
    () => (teamMembersEnabled ? buildTaskAssigneeMemberOptions(catalog) : []),
    [catalog, teamMembersEnabled]
  );

  const totalOptionsCount = 1 + memberOptions.length + agentOptions.length;

  const handleSelect = (kind: PrimaryAssigneeKind, idOrKey: string | null) => {
    onChange({
      ...value,
      primary_assignee_kind: kind,
      primary_assignee_user_id: kind === "user" ? idOrKey : null,
      primary_assignee_agent_type_key: kind === "agent" ? idOrKey : null,
    });
    onSelect?.();
  };

  return (
    <Command className="bg-transparent">
      {totalOptionsCount >= 7 && (
        <CommandInput placeholder="Search assignee..." />
      )}
      <CommandList className="max-h-64 overflow-y-auto">
        <CommandEmpty>No matching assignee.</CommandEmpty>

        <CommandGroup>
          <CommandItem
            className="flex cursor-pointer items-center justify-between px-2 py-1.5 text-sm"
            onSelect={() => handleSelect("none", null)}
          >
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-muted">
                <UserMinus className="h-3.5 w-3.5 text-muted-foreground" />
              </span>
              <span>Unassigned</span>
            </div>
            {value.primary_assignee_kind === "none" && (
              <Check className="h-4 w-4 shrink-0 text-foreground" />
            )}
          </CommandItem>
        </CommandGroup>

        {memberOptions.length > 0 && (
          <CommandGroup heading="Team Members">
            {memberOptions.map((option) => {
              const isSelected =
                value.primary_assignee_kind === "user" &&
                value.primary_assignee_user_id === option.value;
              return (
                <CommandItem
                  className="flex cursor-pointer items-center justify-between px-2 py-1.5 text-sm"
                  key={option.value}
                  onSelect={() => handleSelect("user", option.value)}
                  value={option.label.toLowerCase()}
                >
                  <div className="flex items-center gap-2">
                    <Avatar className="h-5 w-5 shrink-0">
                      <AvatarFallback className="bg-primary text-[10px] text-primary-foreground">
                        {getInitials(option.label)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="truncate">{option.label}</span>
                  </div>
                  {isSelected && (
                    <Check className="h-4 w-4 shrink-0 text-foreground" />
                  )}
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {agentOptions.length > 0 && (
          <CommandGroup heading="Agents">
            {agentOptions.map((option) => {
              const isSelected =
                value.primary_assignee_kind === "agent" &&
                value.primary_assignee_agent_type_key === option.value;
              return (
                <CommandItem
                  className="flex cursor-pointer items-center justify-between px-2 py-1.5 text-sm"
                  key={option.value}
                  onSelect={() => handleSelect("agent", option.value)}
                  value={option.label.toLowerCase()}
                >
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-muted">
                      <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                    </span>
                    <span className="truncate">{option.label}</span>
                  </div>
                  {isSelected && (
                    <Check className="h-4 w-4 shrink-0 text-foreground" />
                  )}
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}
      </CommandList>
      {showAgentDispatchHint && agentOptions.length > 0 && (
        <p className="border-t px-3 py-2 text-muted-foreground text-xs leading-snug">
          {t("form.assigneeAgentDispatchHint")}
        </p>
      )}
    </Command>
  );
}

export function TaskAssigneePicker({
  value,
  onChange,
  catalog,
  disabled,
  loading = false,
  teamMembersEnabled = false,
}: TaskAssigneePickerProps) {
  const { t } = useTranslation("tasks");
  const agentCatalogQuery = useAgentCatalogQuery();
  const [open, setOpen] = useState(false);

  const assigneeProfiles = useMemo(
    () => buildAssigneeProfileMap(catalog),
    [catalog]
  );

  const memberOptions = useMemo(
    () => (teamMembersEnabled ? buildTaskAssigneeMemberOptions(catalog) : []),
    [catalog, teamMembersEnabled]
  );

  const agentOptions = useMemo(
    () =>
      agentCatalogQuery.agents.map((agent) => ({
        value: agent.agent_type_key,
        label: agent.label,
      })),
    [agentCatalogQuery.agents]
  );

  const primaryProfile = resolvePrimaryAssigneeProfile(value, assigneeProfiles);
  const primaryLabel = resolveTaskAssigneeLabel(
    {
      primary_assignee_kind: value.primary_assignee_kind,
      primary_assignee_user_id: value.primary_assignee_user_id,
      primary_assignee_agent_type_key: value.primary_assignee_agent_type_key,
    } as Parameters<typeof resolveTaskAssigneeLabel>[0],
    assigneeProfiles
  );

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>{t("form.primaryAssignee")}</Label>
        <Popover modal={true} onOpenChange={setOpen} open={open}>
          <PopoverTrigger asChild disabled={disabled}>
            <button
              className="flex h-9 w-full items-center justify-between gap-1.5 whitespace-nowrap rounded-md border border-input bg-transparent py-2 pr-2 pl-2.5 text-left text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50"
              type="button"
            >
              {value.primary_assignee_kind === "none" ||
              (!primaryProfile && value.primary_assignee_kind !== "agent") ? (
                <span className="text-muted-foreground">
                  {t("form.assigneeNone")}
                </span>
              ) : value.primary_assignee_kind === "agent" ? (
                <span className="inline-flex min-w-0 items-center gap-2 text-foreground text-sm">
                  <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{primaryLabel}</span>
                </span>
              ) : primaryProfile ? (
                <span className="inline-flex min-w-0 items-center gap-2 text-foreground text-sm">
                  <Avatar className="h-5 w-5 shrink-0">
                    <AvatarFallback className="bg-primary text-[10px] text-primary-foreground">
                      {getInitials(primaryProfile.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate">{primaryProfile.full_name}</span>
                </span>
              ) : (
                <span className="text-muted-foreground">
                  {t("form.assigneeNone")}
                </span>
              )}
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground opacity-50" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-0">
            <UnifiedAssigneeSelector
              agentOptions={agentOptions}
              catalog={catalog}
              onChange={onChange}
              onSelect={() => setOpen(false)}
              teamMembersEnabled={teamMembersEnabled}
              value={value}
            />
          </PopoverContent>
        </Popover>
      </div>

      {teamMembersEnabled && value.primary_assignee_kind !== "none" ? (
        <div className="space-y-2">
          <Label>{t("form.collaborators")}</Label>
          {loading ? (
            <p className="text-muted-foreground text-sm">
              {t("form.assigneeLoading")}
            </p>
          ) : memberOptions.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {t("form.assigneeNoMembers")}
            </p>
          ) : (
            <MultiSelect
              className="w-full min-w-0"
              deduplicateOptions
              defaultValue={value.collaborator_user_ids}
              disabled={disabled}
              onValueChange={(ids) =>
                onChange({
                  ...value,
                  collaborator_user_ids: ids,
                })
              }
              options={memberOptions}
              placeholder={t("form.selectCollaborators")}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}
