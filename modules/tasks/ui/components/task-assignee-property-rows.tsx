import { useTranslation } from "@engenty/i18n/ui";
import {
  Avatar,
  AvatarFallback,
  AvatarStack,
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
import {
  getInitials,
  resolvePrimaryAssigneeProfile,
  type TaskAssigneeValue,
  UnifiedAssigneeSelector,
} from "./task-assignee-picker.js";
import { TaskPropertyEmpty, TaskPropertyRow } from "./task-property-row.js";

interface TaskAssigneePropertyRowsProps {
  assigneeProfiles?: Map<string, { full_name: string; id: string }>;
  catalog: TeamMemberCatalogRow[];
  disabled?: boolean;
  loading?: boolean;
  onChange: (value: TaskAssigneeValue) => void;
  section?: "both" | "collaborators" | "primary";
  teamMembersEnabled?: boolean;
  value: TaskAssigneeValue;
}

export function TaskAssigneePropertyRows({
  value,
  onChange,
  catalog,
  disabled,
  loading = false,
  teamMembersEnabled = false,
  assigneeProfiles: assigneeProfilesProp,
  section = "both",
}: TaskAssigneePropertyRowsProps) {
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

  const collaboratorProfiles = useMemo(
    () =>
      value.collaborator_user_ids
        .map((userId) => assigneeProfiles.get(userId))
        .filter((profile): profile is { full_name: string; id: string } =>
          Boolean(profile)
        ),
    [assigneeProfiles, value.collaborator_user_ids]
  );

  const primaryRow = (
    <Popover modal={false} onOpenChange={setAssigneeOpen} open={assigneeOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <TaskPropertyRow
          disabled={disabled}
          icon={User}
          interactive={!disabled}
          label={t("form.primaryAssignee")}
          showChevron={!disabled}
        >
          {value.primary_assignee_kind === "none" ||
          (!primaryProfile && value.primary_assignee_kind !== "agent") ? (
            <TaskPropertyEmpty>{t("form.assigneeNone")}</TaskPropertyEmpty>
          ) : value.primary_assignee_kind === "agent" ? (
            <span className="inline-flex min-w-0 items-center gap-2 text-sm">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted">
                <Bot className="h-3.5 w-3.5 text-muted-foreground" />
              </span>
              <span className="truncate">{primaryLabel}</span>
            </span>
          ) : primaryProfile ? (
            <span className="inline-flex min-w-0 items-center gap-2 text-sm">
              <Avatar className="h-6 w-6 shrink-0">
                <AvatarFallback className="bg-primary text-primary-foreground text-xxs">
                  {getInitials(primaryProfile.full_name)}
                </AvatarFallback>
              </Avatar>
              <span className="truncate">{primaryProfile.full_name}</span>
            </span>
          ) : (
            <TaskPropertyEmpty>{t("form.assigneeNone")}</TaskPropertyEmpty>
          )}
        </TaskPropertyRow>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <UnifiedAssigneeSelector
          agentOptions={agentOptions}
          catalog={catalog}
          onChange={onChange}
          onSelect={() => setAssigneeOpen(false)}
          // This task already exists: handing it to an agent dispatches it on
          // the spot, and nothing else on the page says so.
          showAgentDispatchHint
          teamMembersEnabled={teamMembersEnabled}
          value={value}
        />
      </PopoverContent>
    </Popover>
  );

  const collaboratorsRow =
    teamMembersEnabled && value.primary_assignee_kind !== "none" ? (
      <Popover
        modal={false}
        onOpenChange={setCollaboratorsOpen}
        open={collaboratorsOpen}
      >
        <PopoverTrigger asChild disabled={disabled}>
          <TaskPropertyRow
            disabled={disabled}
            icon={Users}
            interactive={!disabled}
            label={t("form.collaborators")}
            showChevron={!disabled}
          >
            {loading ? (
              <TaskPropertyEmpty>{t("form.assigneeLoading")}</TaskPropertyEmpty>
            ) : collaboratorProfiles.length === 0 ? (
              <TaskPropertyEmpty>
                {t("detail.noCollaborators")}
              </TaskPropertyEmpty>
            ) : (
              <AvatarStack max={3} profiles={collaboratorProfiles} size="sm" />
            )}
          </TaskPropertyRow>
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
    ) : null;

  if (section === "primary") {
    return primaryRow;
  }
  if (section === "collaborators") {
    return collaboratorsRow;
  }
  return (
    <>
      {primaryRow}
      {collaboratorsRow}
    </>
  );
}
