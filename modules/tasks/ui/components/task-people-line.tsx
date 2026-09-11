import { useTranslation } from "@engenty/i18n/ui";
import {
  Avatar,
  AvatarFallback,
  MultiSelect,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@engenty/ui-core";
import { Bot, User, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { useAgentCatalogQuery } from "../hooks/use-agent-catalog-query.js";
import { resolveTaskAssigneeLabel } from "../lib/format-assignee.js";
import { buildTaskAssigneeMemberOptions } from "../lib/team-catalog-ui.js";
import {
  buildAssigneeProfileMap,
  type TeamMemberCatalogRow,
} from "../plugins.js";
import { pillClass } from "./new-task-selectors.js";
import {
  getInitials,
  resolvePrimaryAssigneeProfile,
  type TaskAssigneeValue,
  UnifiedAssigneeSelector,
} from "./task-assignee-picker.js";

interface TaskPeopleLineProps {
  assigneeProfiles?: Map<string, { full_name: string; id: string }>;
  catalog: TeamMemberCatalogRow[];
  disabled?: boolean;
  loading?: boolean;
  onChange: (value: TaskAssigneeValue) => void;
  teamMembersEnabled?: boolean;
  value: TaskAssigneeValue;
}

export function TaskPeopleLine({
  value,
  onChange,
  catalog,
  disabled,
  loading = false,
  teamMembersEnabled = false,
  assigneeProfiles: assigneeProfilesProp,
}: TaskPeopleLineProps) {
  const { t } = useTranslation("tasks");
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [collaboratorsOpen, setCollaboratorsOpen] = useState(false);
  const agentCatalogQuery = useAgentCatalogQuery();
  const assigneeProfiles = useMemo(
    () => assigneeProfilesProp ?? buildAssigneeProfileMap(catalog),
    [assigneeProfilesProp, catalog]
  );
  const memberOptions = useMemo(
    () => buildTaskAssigneeMemberOptions(catalog),
    [catalog]
  );
  const agentOptions = useMemo(
    () =>
      agentCatalogQuery.agents.map((agent) => ({
        label: agent.label,
        value: agent.agent_type_key,
      })),
    [agentCatalogQuery.agents]
  );
  const primaryProfile = resolvePrimaryAssigneeProfile(value, assigneeProfiles);
  const primaryLabel = resolveTaskAssigneeLabel(
    {
      primary_assignee_agent_type_key: value.primary_assignee_agent_type_key,
      primary_assignee_kind: value.primary_assignee_kind,
      primary_assignee_user_id: value.primary_assignee_user_id,
    } as Parameters<typeof resolveTaskAssigneeLabel>[0],
    assigneeProfiles
  );
  const collaboratorProfiles = useMemo(
    () =>
      value.collaborator_user_ids
        .map((userId) => assigneeProfiles.get(userId))
        .filter((profile): profile is { full_name: string; id: string } =>
          Boolean(profile)
        ),
    [assigneeProfiles, value.collaborator_user_ids]
  );
  const triggerClassName = `${pillClass} max-w-full disabled:cursor-default disabled:opacity-60`;

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-1 text-xs">
      <Popover modal={false} onOpenChange={setAssigneeOpen} open={assigneeOpen}>
        <PopoverTrigger asChild>
          <button
            className={triggerClassName}
            disabled={disabled}
            type="button"
          >
            {value.primary_assignee_kind === "agent" ? (
              <Bot className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            ) : primaryProfile ? (
              <Avatar className="h-4 w-4 shrink-0">
                <AvatarFallback className="bg-primary text-[8px] text-primary-foreground">
                  {getInitials(primaryProfile.full_name)}
                </AvatarFallback>
              </Avatar>
            ) : (
              <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
            <span className="max-w-48 truncate text-foreground">
              {value.primary_assignee_kind === "none"
                ? t("form.assigneeNone")
                : primaryLabel}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0">
          <UnifiedAssigneeSelector
            agentOptions={agentOptions}
            catalog={catalog}
            onChange={onChange}
            onSelect={() => setAssigneeOpen(false)}
            showAgentDispatchHint
            teamMembersEnabled={teamMembersEnabled}
            value={value}
          />
        </PopoverContent>
      </Popover>

      {teamMembersEnabled && value.primary_assignee_kind !== "none" ? (
        <Popover
          modal={false}
          onOpenChange={setCollaboratorsOpen}
          open={collaboratorsOpen}
        >
          <PopoverTrigger asChild>
            <button
              className={triggerClassName}
              disabled={disabled}
              type="button"
            >
              <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="max-w-56 truncate text-foreground">
                {loading
                  ? t("form.assigneeLoading")
                  : collaboratorProfiles.length > 0
                    ? collaboratorProfiles
                        .map((profile) => profile.full_name)
                        .join(", ")
                    : t("detail.noCollaborators")}
              </span>
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-3">
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
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}
