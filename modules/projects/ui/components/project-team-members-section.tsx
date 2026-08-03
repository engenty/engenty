import { useTranslation } from "@engenty/i18n/ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Avatar,
  AvatarFallback,
  AvatarStack,
  type Profile as AvatarStackProfile,
  Button,
  Checkbox,
  cn,
  Input,
  Label,
  MultiSelect,
  type MultiSelectOption,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@engenty/ui-core";
import { Check, Pencil, Plus, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { ProjectMemberRole, ProjectTeamMemberRow } from "../api.js";
import { updateProject } from "../api.js";
import {
  buildProjectTeamMemberAddOptions,
  projectTeamMemberCatalogId,
} from "../lib/project-team-members-ui.js";
import type { TeamMemberCatalogRow } from "../plugins.js";

const PROJECT_ROLES: ProjectMemberRole[] = [
  "project-lead",
  "project-member",
  "project-external",
];

interface ProjectTeamMembersSectionProps {
  catalog: TeamMemberCatalogRow[];
  className?: string;
  onProjectUpdated: () => void | Promise<void>;
  projectId: string;
  projectTeamMembers: ProjectTeamMemberRow[];
}

function catalogRowByMembershipKey(
  catalog: TeamMemberCatalogRow[]
): Map<string, TeamMemberCatalogRow> {
  const map = new Map<string, TeamMemberCatalogRow>();
  for (const row of catalog) {
    map.set(projectTeamMemberCatalogId(row), row);
    map.set(row.id, row);
  }
  return map;
}

function formatProjectRoleDisplay(
  role: ProjectMemberRole,
  roleName: string | null,
  t: (key: string) => string
): string {
  if (roleName?.trim()) {
    return roleName.trim();
  }
  return t(`detail.members.projectRole.${role}`);
}

function ProjectMemberRoleField({
  disabled,
  fullName,
  onRemove,
  onSave,
  role,
  roleName,
  t,
  userId,
}: {
  disabled: boolean;
  fullName: string;
  onRemove: (userId: string, fullName: string) => void;
  onSave: (role: ProjectMemberRole, roleName: string | null) => void;
  role: ProjectMemberRole;
  roleName: string | null;
  t: (key: string) => string;
  userId: string;
}) {
  const [open, setOpen] = useState(false);
  const [isLead, setIsLead] = useState(role === "project-lead");
  const [selectValue, setSelectValue] = useState<ProjectMemberRole>(
    role === "project-lead" ? "project-member" : role
  );
  const [inputValue, setInputValue] = useState(roleName ?? "");

  useEffect(() => {
    if (!open) {
      return;
    }
    setIsLead(role === "project-lead");
    setSelectValue(role === "project-lead" ? "project-member" : role);
    setInputValue(roleName ?? "");
  }, [open, role, roleName]);

  const handleSave = () => {
    const effectiveRole = isLead ? "project-lead" : selectValue;
    onSave(effectiveRole as ProjectMemberRole, inputValue.trim() || null);
    setOpen(false);
  };

  const handleRemove = () => {
    onRemove(userId, fullName);
    setOpen(false);
  };

  const displayText = formatProjectRoleDisplay(role, roleName, t) || "-";

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <button
          aria-label={t("detail.members.editRole")}
          className="group/role -mx-1 inline-flex cursor-pointer items-center gap-1.5 rounded px-1 text-left text-muted-foreground text-xs hover:text-foreground hover:outline-dashed hover:outline-1 hover:outline-muted-foreground/50 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled}
          type="button"
        >
          <span className="truncate">{displayText}</span>
          {disabled ? null : (
            <Pencil
              aria-hidden
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/role:opacity-100"
            />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3" sideOffset={4}>
        <div className="space-y-3">
          <h4 className="font-medium text-sm">{fullName}</h4>
          {isLead ? null : (
            <div className="space-y-2">
              <Label className="text-xs">{t("detail.members.roleLabel")}</Label>
              <Select
                onValueChange={(v) => setSelectValue(v as ProjectMemberRole)}
                value={selectValue}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue>
                    {selectValue === "project-external"
                      ? t("detail.members.projectRole.project-external")
                      : t("detail.members.projectRole.project-member")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="project-member">
                    {t("detail.members.projectRole.project-member")}
                  </SelectItem>
                  <SelectItem value="project-external">
                    {t("detail.members.projectRole.project-external")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Checkbox
              checked={isLead}
              id="project-lead"
              onCheckedChange={(checked) => setIsLead(checked === true)}
            />
            <Label
              className="cursor-pointer font-normal text-sm"
              htmlFor="project-lead"
            >
              {t("detail.members.projectRole.project-lead")}
            </Label>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">
              {t("detail.members.roleNameLabel")}
            </Label>
            <Input
              className="text-sm"
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={t("detail.members.roleNamePlaceholder")}
              value={inputValue}
            />
          </div>
          <div className="flex justify-between">
            <Button
              className="h-7 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={handleRemove}
              size="sm"
              type="button"
              variant="ghost"
            >
              {t("detail.members.remove")}
            </Button>
            <Button className="h-7 gap-1 px-2" onClick={handleSave} size="sm">
              <Check className="h-3.5 w-3.5" />
              {t("detail.portal.save")}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CollapsedMembersPreview({
  formatRole,
  leadMembers,
  onExpand,
  otherProfiles,
  rowByKey,
}: {
  formatRole: (role: ProjectMemberRole, roleName: string | null) => string;
  leadMembers: ProjectTeamMemberRow[];
  onExpand: () => void;
  otherProfiles: AvatarStackProfile[];
  rowByKey: Map<string, TeamMemberCatalogRow>;
}) {
  if (leadMembers.length === 0 && otherProfiles.length === 0) {
    return null;
  }
  return (
    <button
      className="flex min-w-0 cursor-pointer flex-wrap items-center gap-3 pt-1 text-left transition-opacity hover:opacity-90"
      onClick={onExpand}
      type="button"
    >
      {leadMembers.map((m) => {
        const row = rowByKey.get(m.user_id);
        const isConnected = Boolean(row?.user_id);
        const fullName = row?.full_name ?? m.user_id;
        const initials =
          fullName
            .split(/\s+/)
            .map((s) => s[0])
            .join("")
            .toUpperCase()
            .slice(0, 2) || "?";
        return (
          <div className="flex items-center gap-3" key={m.user_id}>
            <Avatar className="h-12 w-12 shrink-0">
              <AvatarFallback
                className={
                  isConnected
                    ? "bg-primary text-base text-primary-foreground"
                    : "bg-muted text-base text-muted-foreground"
                }
              >
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate font-medium text-sm">{fullName}</p>
              <p className="text-muted-foreground text-xs">
                {formatRole(m.role, m.role_name)}
              </p>
            </div>
          </div>
        );
      })}
      {otherProfiles.length > 0 ? (
        <AvatarStack max={12} profiles={otherProfiles} size="xl" />
      ) : null}
    </button>
  );
}

export function ProjectTeamMembersSection({
  projectId,
  projectTeamMembers,
  catalog,
  onProjectUpdated,
  className,
}: ProjectTeamMembersSectionProps) {
  const { t } = useTranslation("projects");
  const members = useMemo(
    () =>
      [...(projectTeamMembers ?? [])].sort((a, b) => {
        if (a.role === "project-lead") {
          return -1;
        }
        if (b.role === "project-lead") {
          return 1;
        }
        return 0;
      }),
    [projectTeamMembers]
  );
  const memberIds = useMemo(
    () => [...new Set(members.map((m) => m.user_id).filter(Boolean))],
    [members]
  );

  const [listExpanded, setListExpanded] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<{
    fullName: string;
    userId: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rowByKey = useMemo(() => catalogRowByMembershipKey(catalog), [catalog]);

  const leadMembers = useMemo(
    () => members.filter((m) => m.role === "project-lead"),
    [members]
  );
  const otherMembers = useMemo(
    () => members.filter((m) => m.role !== "project-lead"),
    [members]
  );

  const otherProfiles = useMemo(
    (): AvatarStackProfile[] =>
      otherMembers.map((m) => {
        const row = rowByKey.get(m.user_id);
        return {
          id: m.user_id,
          full_name: row?.full_name ?? m.user_id,
          avatar_url: null,
          is_connected: Boolean(row?.user_id),
        };
      }),
    [otherMembers, rowByKey]
  );

  const addOptions: MultiSelectOption[] = useMemo(
    () => buildProjectTeamMemberAddOptions(catalog, memberIds),
    [catalog, memberIds]
  );

  const persist = useCallback(
    async (nextMembers: ProjectTeamMemberRow[]) => {
      setSaving(true);
      setError(null);
      try {
        await updateProject(projectId, {
          project_team: nextMembers.map((m) => ({
            user_id: m.user_id,
            role: m.role,
            role_name: m.role_name,
          })),
        });
        await onProjectUpdated();
      } catch {
        setError(t("detail.members.saveFailed"));
      } finally {
        setSaving(false);
      }
    },
    [projectId, onProjectUpdated, t]
  );

  const handleRemove = useCallback((userId: string, fullName: string) => {
    setMemberToRemove({ fullName, userId });
  }, []);

  const confirmRemove = useCallback(() => {
    if (!memberToRemove) {
      return;
    }
    const next = members
      .filter((m) => m.user_id !== memberToRemove.userId)
      .map((m) => ({ ...m }));
    setMemberToRemove(null);
    void persist(next);
  }, [memberToRemove, members, persist]);

  const handleRoleChange = useCallback(
    (userId: string, role: ProjectMemberRole, roleName: string | null) => {
      const next = members.map((m) => {
        if (m.user_id !== userId) {
          if (role === "project-lead" && m.role === "project-lead") {
            return { ...m, role: "project-member" as const };
          }
          return { ...m };
        }
        return { ...m, role, role_name: roleName };
      }) as ProjectTeamMemberRow[];
      void persist(next);
    },
    [members, persist]
  );

  const handleAddFromMultiSelect = useCallback(
    (picked: string[]) => {
      const existingIds = new Set(memberIds);
      const toAdd = picked.filter((id) => !existingIds.has(id));
      const next = [
        ...members,
        ...toAdd.map((user_id) => ({
          project_id: projectId,
          user_id,
          role: "project-member" as const,
          role_name: null as string | null,
        })),
      ];
      void persist(next);
    },
    [members, memberIds, projectId, persist]
  );

  const memberRows = useMemo(
    () =>
      members.map((m) => {
        const row = rowByKey.get(m.user_id);
        const isConnected = Boolean(row?.user_id);
        const fullName = row?.full_name ?? m.user_id;
        const initials =
          fullName
            .split(/\s+/)
            .map((s) => s[0])
            .join("")
            .toUpperCase()
            .slice(0, 2) || "?";
        return {
          fullName,
          initials,
          projectRole: m.role,
          roleName: m.role_name,
          userId: m.user_id,
          isConnected,
        };
      }),
    [members, rowByKey]
  );

  return (
    <div className={cn("mt-6 space-y-3", className)}>
      <div className="group/header flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <h3 className="flex items-center gap-2 font-medium text-lg">
            <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
            {t("detail.members.listHeading")}
          </h3>
          {memberIds.length > 0 ? (
            <Button
              aria-expanded={listExpanded}
              aria-label={
                listExpanded
                  ? t("detail.members.toggleLabelClose")
                  : t("detail.members.toggleLabel")
              }
              className="h-7 w-7 p-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/header:opacity-100"
              onClick={() => setListExpanded((v) => !v)}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Pencil className="h-4 w-4" />
            </Button>
          ) : null}
          {addOptions.length > 0 ? (
            <div className="opacity-0 transition-opacity focus-within:opacity-100 group-hover/header:opacity-100">
              <MultiSelect
                align="start"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground [&_svg]:mx-auto [&_svg]:h-4 [&_svg]:w-4"
                deduplicateOptions
                defaultValue={[]}
                disabled={saving}
                hideSelectAll
                key={memberIds.join(",")}
                onValueChange={(vals) => {
                  if (vals.length > 0) {
                    handleAddFromMultiSelect(vals);
                  }
                }}
                options={addOptions}
                placeholder={t("detail.members.addPlaceholder")}
                popoverClassName="w-64 max-w-full"
                triggerElement={<Plus className="h-4 w-4" />}
                variant="ghost"
              />
            </div>
          ) : null}
        </div>
      </div>

      {memberIds.length > 0 && !listExpanded ? (
        <CollapsedMembersPreview
          formatRole={(role, roleName) =>
            formatProjectRoleDisplay(role, roleName, t)
          }
          leadMembers={leadMembers}
          onExpand={() => setListExpanded(true)}
          otherProfiles={otherProfiles}
          rowByKey={rowByKey}
        />
      ) : null}

      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      <AlertDialog
        onOpenChange={(open) => !open && setMemberToRemove(null)}
        open={!!memberToRemove}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {memberToRemove
                ? t("detail.members.removeConfirmTitle", {
                    name: memberToRemove.fullName,
                  })
                : ""}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("detail.members.removeConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("detail.portal.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmRemove}
            >
              {t("detail.members.remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {memberIds.length === 0 ? (
        <div className="text-muted-foreground text-sm">
          {t("detail.members.emptyDescription")}{" "}
          {/* No candidates left (or none in the tenant yet) - point at the team
              module instead of silently dropping the only add affordance. */}
          {addOptions.length === 0 ? (
            <Link
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
              to="/mdl/team"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("detail.members.emptyCatalogLink")}
            </Link>
          ) : (
            <MultiSelect
              align="start"
              className="inline-flex h-auto w-auto border-0 bg-transparent p-0 font-medium text-primary shadow-none hover:bg-transparent hover:text-primary/80 hover:underline"
              deduplicateOptions
              defaultValue={[]}
              disabled={saving}
              hideSelectAll
              key={memberIds.join(",")}
              onValueChange={(vals) => {
                if (vals.length > 0) {
                  handleAddFromMultiSelect(vals);
                }
              }}
              options={addOptions}
              placeholder={t("detail.members.addPlaceholder")}
              popoverClassName="w-64 max-w-full"
              triggerElement={
                <span className="inline-flex items-center gap-1">
                  <Plus className="h-3.5 w-3.5" />
                  {t("detail.members.addLink")}
                </span>
              }
              variant="ghost"
            />
          )}
        </div>
      ) : null}

      {listExpanded && memberRows.length > 0 ? (
        <ul className="space-y-0 pt-2">
          {memberRows.map((member) => (
            <li
              className="group flex items-center gap-3 py-2.5"
              key={member.userId}
            >
              <Avatar className="h-9 w-9 shrink-0">
                <AvatarFallback
                  className={
                    member.isConnected
                      ? "bg-primary text-primary-foreground text-sm"
                      : "bg-muted text-muted-foreground text-sm"
                  }
                >
                  {member.initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-sm">
                  {member.fullName}
                </p>
                <div className="mt-0.5">
                  <ProjectMemberRoleField
                    disabled={saving}
                    fullName={member.fullName}
                    onRemove={handleRemove}
                    onSave={(role, roleName) =>
                      handleRoleChange(member.userId, role, roleName)
                    }
                    role={member.projectRole}
                    roleName={member.roleName}
                    t={t}
                    userId={member.userId}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
