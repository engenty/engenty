// Inspector tab: pick a user, agent, or role and see the capabilities that
// apply, plus a "can they do X?" tester that runs the SAME capabilityCovers
// matcher the server enforces, so the answer can't drift from evaluatePolicy's
// capability step.
//
// User/agent mode resolves effective grants (base role ∪ assignments).
// Role mode inspects a base/custom role's declared capability bundle — not
// module viewer/editor profiles (those are assignable packs, listed on Roles).

import { useQuery } from "@engenty/query-client";
import {
  Badge,
  Input,
  Label,
  SearchableSelect,
  type SearchableSelectOption,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingsFormRow,
  SettingsFormSection,
} from "@engenty/ui-core";
import { useMemo, useState } from "react";
import {
  type AuthzRole,
  capabilityCovers,
  getEffectiveGrants,
  listCapabilities,
  listRoles,
  listTenantRoles,
  listTenantUsers,
  type SubjectKind,
  type TenantRole,
} from "@/lib/authz-admin-api";
import { humanizeCapability } from "./humanize-capability";
import { Pill } from "./pills";
import { RoleOptionLabel } from "./role-option-label";

type InspectKind = SubjectKind | "role";

interface RoleOption {
  capabilities: string[];
  description: string | null;
  id: string;
  source: string;
  system: boolean;
  title: string;
}

interface Props {
  tenantId: string;
}

/** Base tenant/platform/agent roles + tenant custom roles — not module packs. */
function isInspectableRole(role: RoleOption): boolean {
  return (
    role.source === "core" ||
    role.source === "custom" ||
    role.id.startsWith("custom.")
  );
}

function toRoleOption(role: AuthzRole): RoleOption {
  return {
    id: role.id,
    title: role.title,
    description: role.description,
    capabilities: role.capabilities,
    system: role.system,
    source: role.source,
  };
}

function customToRoleOption(role: TenantRole): RoleOption {
  return {
    id: role.role_id,
    title: role.title,
    description: role.description,
    capabilities: role.capabilities,
    system: false,
    source: "custom",
  };
}

const selectTriggerClass =
  "ui-canvas-field h-8 w-full min-w-0 max-w-full justify-between overflow-hidden";

export function InspectorTab({ tenantId }: Props) {
  const usersQuery = useQuery({
    queryKey: ["authz-admin", "tenant-users"],
    queryFn: listTenantUsers,
  });
  const capsQuery = useQuery({
    queryKey: ["authz-admin", "capabilities"],
    queryFn: listCapabilities,
  });
  const rolesQuery = useQuery({
    queryKey: ["authz-admin", "roles"],
    queryFn: listRoles,
  });
  const customRolesQuery = useQuery({
    queryKey: ["authz-admin", "tenant-roles", tenantId],
    queryFn: () => listTenantRoles(tenantId),
  });

  const [kind, setKind] = useState<InspectKind>("user");
  const [subjectId, setSubjectId] = useState("");
  const [roleId, setRoleId] = useState("");
  const [probe, setProbe] = useState("");

  // Full registry (incl. module viewer/editor) for resolving badge deep-links.
  const allProfiles = useMemo(() => {
    const byId = new Map<string, RoleOption>();
    for (const role of rolesQuery.data ?? []) {
      byId.set(role.id, toRoleOption(role));
    }
    for (const role of customRolesQuery.data ?? []) {
      byId.set(role.role_id, customToRoleOption(role));
    }
    return byId;
  }, [rolesQuery.data, customRolesQuery.data]);

  const roleOptions = useMemo(
    () =>
      [...allProfiles.values()]
        .filter(isInspectableRole)
        .sort((a, b) => a.id.localeCompare(b.id)),
    [allProfiles]
  );

  const selectedRole = useMemo(() => {
    if (!roleId) {
      return null;
    }
    return (
      allProfiles.get(roleId) ??
      roleOptions.find((r) => r.id === roleId) ??
      null
    );
  }, [allProfiles, roleOptions, roleId]);

  const isSubjectMode = kind === "user" || kind === "agent";

  const grantsQuery = useQuery({
    queryKey: ["authz-admin", "effective-grants", kind, subjectId],
    queryFn: () =>
      getEffectiveGrants(tenantId, kind as SubjectKind, subjectId.trim()),
    enabled: isSubjectMode && subjectId.trim().length > 0,
  });

  const capabilities = isSubjectMode
    ? (grantsQuery.data?.capabilities ?? [])
    : (selectedRole?.capabilities ?? []);

  const roleProfiles = isSubjectMode
    ? (grantsQuery.data?.roleProfiles ?? [])
    : selectedRole
      ? [selectedRole.id]
      : [];

  const showResults =
    (isSubjectMode && subjectId.trim().length > 0) ||
    (kind === "role" && selectedRole !== null);

  const covered = useMemo(
    () => (probe.trim() ? capabilityCovers(capabilities, probe.trim()) : null),
    [capabilities, probe]
  );

  const probeOptions = useMemo((): SearchableSelectOption[] => {
    const options = (capsQuery.data ?? []).map((entry) => {
      const ops = entry.operations;
      const modules = [...new Set(ops.map((o) => o.moduleId))].filter(Boolean);
      return {
        value: entry.capability,
        label: humanizeCapability(entry.capability),
        description: entry.capability,
        descriptionClassName: "font-mono",
        badgeLabel:
          ops.length > 0
            ? `${ops.length} op${ops.length === 1 ? "" : "s"}`
            : undefined,
        keywords: [
          entry.capability,
          ...modules,
          ...ops.map((o) => o.operationId),
        ]
          .join(" ")
          .toLowerCase(),
      };
    });
    return options.sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
    );
  }, [capsQuery.data]);

  return (
    <div className="space-y-6">
      <SettingsFormSection
        description={
          kind === "role"
            ? "Inspect a base or custom role's capability bundle and test a capability against it."
            : "Resolve a subject's effective grants — base role plus assignments — and test a capability."
        }
        title="Effective grants inspector"
      >
        <SettingsFormRow label="Inspect">
          <Select
            onValueChange={(v) => {
              setKind(v as InspectKind);
              setSubjectId("");
              setRoleId("");
              setProbe("");
            }}
            value={kind}
          >
            <SelectTrigger className={selectTriggerClass}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="user">User</SelectItem>
              <SelectItem value="agent">Agent</SelectItem>
              <SelectItem value="role">Role</SelectItem>
            </SelectContent>
          </Select>
        </SettingsFormRow>
        {kind === "user" && (
          <SettingsFormRow label="User">
            <Select onValueChange={setSubjectId} value={subjectId}>
              <SelectTrigger className={selectTriggerClass}>
                <SelectValue placeholder="Select a user" />
              </SelectTrigger>
              <SelectContent>
                {(usersQuery.data ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.display_name || u.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingsFormRow>
        )}
        {kind === "agent" && (
          <SettingsFormRow label="Agent id">
            <Input
              className="ui-canvas-field h-8 w-full min-w-0"
              onChange={(e) => setSubjectId(e.target.value)}
              placeholder="agent uuid"
              value={subjectId}
            />
          </SettingsFormRow>
        )}
        {kind === "role" && (
          <SettingsFormRow
            hint="Base roles (Member, Admin, …) and tenant custom roles. Module viewer/editor packs stay on the Roles tab."
            label="Role"
          >
            <Select onValueChange={setRoleId} value={roleId || undefined}>
              <SelectTrigger className={selectTriggerClass}>
                <SelectValue placeholder="Select a role">
                  {selectedRole?.title}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-w-[min(28rem,calc(100vw-2rem))]">
                {roleOptions.map((r) => (
                  <SelectItem
                    className="items-start py-2"
                    key={r.id}
                    value={r.id}
                  >
                    <RoleOptionLabel id={r.id} title={r.title} />
                  </SelectItem>
                ))}
                {/* Keep deep-linked module profiles selectable while open. */}
                {selectedRole &&
                  !isInspectableRole(selectedRole) &&
                  !roleOptions.some((r) => r.id === selectedRole.id) && (
                    <SelectItem
                      className="items-start py-2"
                      value={selectedRole.id}
                    >
                      <RoleOptionLabel
                        id={selectedRole.id}
                        title={selectedRole.title}
                      />
                    </SelectItem>
                  )}
              </SelectContent>
            </Select>
          </SettingsFormRow>
        )}
      </SettingsFormSection>

      {showResults && (
        <SettingsFormSection
          description={
            kind === "role"
              ? "Capabilities declared by this role. The tester uses the same matcher as server enforcement."
              : "Base role + assignments resolved to the capability union. The tester uses the same matcher as server enforcement."
          }
          title={kind === "role" ? "Role capabilities" : "Resolved grants"}
        >
          {kind === "role" && selectedRole && (
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <code className="max-w-full truncate font-mono text-foreground text-sm">
                {selectedRole.id}
              </code>
              {selectedRole.system ? (
                <Pill tone="info">system</Pill>
              ) : selectedRole.source === "custom" ? (
                <Pill tone="accent">custom</Pill>
              ) : (
                <Pill tone="neutral">profile</Pill>
              )}
              <span className="min-w-0 truncate text-muted-foreground text-xs">
                {selectedRole.title}
                {selectedRole.source ? ` · source: ${selectedRole.source}` : ""}
              </span>
              {selectedRole.description ? (
                <p className="w-full text-muted-foreground text-xs">
                  {selectedRole.description}
                </p>
              ) : null}
            </div>
          )}

          {isSubjectMode && (
            <div className="space-y-1.5">
              <span className="text-[11px] text-muted-foreground uppercase tracking-wide">
                Role profiles
              </span>
              <div className="flex flex-wrap gap-1">
                {roleProfiles.map((r) => (
                  <Badge
                    className="cursor-pointer"
                    key={r}
                    onClick={() => {
                      setKind("role");
                      setSubjectId("");
                      setRoleId(r);
                      setProbe("");
                    }}
                    title="Inspect this role"
                    variant="outline"
                  >
                    {r}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <span className="text-[11px] text-muted-foreground uppercase tracking-wide">
              Capabilities ({capabilities.length})
            </span>
            <div className="flex min-w-0 flex-wrap gap-1">
              {capabilities.map((c) => (
                <code
                  className="max-w-full truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
                  key={c}
                >
                  {c}
                </code>
              ))}
            </div>
          </div>

          <div className="space-y-1.5 border-border/60 border-t pt-3">
            <Label className="text-sm" htmlFor="probe">
              {kind === "role" ? "Does this role cover…?" : "Can they do…?"}
            </Label>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <SearchableSelect
                className="ui-canvas-field max-w-sm"
                emptyMessage="No matching capabilities."
                id="probe"
                onValueChange={setProbe}
                options={probeOptions}
                placeholder="Search capabilities…"
                searchPlaceholder="Filter by name or id…"
                triggerClassName="h-8"
                value={probe}
              />
              {covered !== null && (
                <Badge variant={covered ? "secondary" : "destructive"}>
                  {covered ? "Allowed" : "Denied"}
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground text-xs">
              Capability check only — profile-policy conditions (project
              visibility, ownership, agent approval) may add further
              restrictions at call time.
            </p>
          </div>
        </SettingsFormSection>
      )}
    </div>
  );
}
