// Assignments tab: grant an extra role to a user or agent. Base roles
// (tenant.member/admin, agent.assistant) are automatic — this only manages the
// explicit extra roles layered on top.

import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingsFormSection,
} from "@engenty/ui-core";
import { Trash2 } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import {
  assignRole,
  listAssignments,
  listRoles,
  listTenantRoles,
  listTenantUsers,
  type SubjectKind,
  unassignRole,
} from "@/lib/authz-admin-api";
import { Pill } from "./pills";
import { RoleOptionLabel } from "./role-option-label";

export const ASSIGNMENTS_QUERY_KEY = ["authz-admin", "assignments"];

interface Props {
  tenantId: string;
}

interface RoleOption {
  id: string;
  title: string;
}

/** Compact labelled field: small label above the control, grouped left. */
function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`space-y-1 ${className ?? ""}`}>
      <span className="font-medium text-muted-foreground text-xs">{label}</span>
      {children}
    </div>
  );
}

export function AssignmentsTab({ tenantId }: Props) {
  const queryClient = useQueryClient();
  const assignmentsQuery = useQuery({
    queryKey: ASSIGNMENTS_QUERY_KEY,
    queryFn: () => listAssignments(tenantId),
  });
  const usersQuery = useQuery({
    queryKey: ["authz-admin", "tenant-users"],
    queryFn: listTenantUsers,
  });
  const rolesQuery = useQuery({
    queryKey: ["authz-admin", "roles"],
    queryFn: listRoles,
  });
  const customQuery = useQuery({
    queryKey: ["authz-admin", "tenant-roles"],
    queryFn: () => listTenantRoles(tenantId),
  });

  const [kind, setKind] = useState<SubjectKind>("user");
  const [subjectId, setSubjectId] = useState("");
  const [roleId, setRoleId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const roleOptions = useMemo(() => {
    const byId = new Map<string, RoleOption>();
    for (const r of rolesQuery.data ?? []) {
      byId.set(r.id, { id: r.id, title: r.title || r.id });
    }
    for (const r of customQuery.data ?? []) {
      byId.set(r.role_id, {
        id: r.role_id,
        title: r.title || r.role_id,
      });
    }
    return [...byId.values()].sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { sensitivity: "base" })
    );
  }, [rolesQuery.data, customQuery.data]);

  const selectedRoleTitle = roleOptions.find((r) => r.id === roleId)?.title;

  const userLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of usersQuery.data ?? []) {
      map.set(u.id, u.display_name || u.email);
    }
    return map;
  }, [usersQuery.data]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ASSIGNMENTS_QUERY_KEY });

  const assignMutation = useMutation({
    mutationFn: () =>
      assignRole(tenantId, {
        roleId,
        subjectKind: kind,
        subjectId: subjectId.trim(),
      }),
    onSuccess: () => {
      setError(null);
      setSubjectId("");
      setRoleId("");
      void invalidate();
    },
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message : "Failed to assign"),
  });

  const unassignMutation = useMutation({
    mutationFn: (v: {
      roleId: string;
      subjectKind: SubjectKind;
      subjectId: string;
    }) => unassignRole(tenantId, v),
    onSuccess: () => void invalidate(),
  });

  const canAssign = Boolean(roleId && subjectId.trim());
  const assignments = assignmentsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <SettingsFormSection
        description="Give a user or agent an extra role, on top of the capabilities they already have from their base role."
        title="Grant a role"
      >
        <div className="flex flex-wrap items-end gap-3">
          <Field className="w-28" label="To a">
            <Select
              onValueChange={(v) => {
                setKind(v as SubjectKind);
                setSubjectId("");
              }}
              value={kind}
            >
              <SelectTrigger className="ui-canvas-field h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="agent">Agent</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field
            className="min-w-48 flex-1"
            label={kind === "user" ? "Named" : "Agent id"}
          >
            {kind === "user" ? (
              <Select onValueChange={setSubjectId} value={subjectId}>
                <SelectTrigger className="ui-canvas-field h-8">
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
            ) : (
              <Input
                className="ui-canvas-field h-8"
                onChange={(e) => setSubjectId(e.target.value)}
                placeholder="agent uuid"
                value={subjectId}
              />
            )}
          </Field>

          <Field className="min-w-56 flex-1" label="Grant role">
            <Select onValueChange={setRoleId} value={roleId || undefined}>
              <SelectTrigger className="ui-canvas-field h-8 w-full min-w-0 max-w-full overflow-hidden">
                <SelectValue placeholder="Select a role">
                  {selectedRoleTitle}
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
              </SelectContent>
            </Select>
          </Field>

          <Button
            className="h-8"
            disabled={!canAssign || assignMutation.isPending}
            onClick={() => assignMutation.mutate()}
            size="sm"
            type="button"
          >
            Grant
          </Button>
        </div>
        {error && <p className="text-destructive text-xs">{error}</p>}
      </SettingsFormSection>

      <SettingsFormSection
        description="Extra roles granted here. Base roles (member, admin, agent) are automatic and not listed."
        title="Granted roles"
      >
        {assignments.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nobody has an extra role yet — everyone works from their base role.
          </p>
        ) : (
          assignments.map((a) => {
            const sKind: SubjectKind = a.user_id ? "user" : "agent";
            const sId = a.user_id ?? a.agent_id ?? "";
            const label =
              sKind === "user" ? (userLabel.get(sId) ?? sId) : `agent ${sId}`;
            return (
              <div
                className="flex items-center justify-between gap-3 border-border/40 border-b py-2 last:border-0"
                key={a.id}
              >
                <div className="flex min-w-0 items-center gap-2 text-sm">
                  <span className="truncate font-medium">{label}</span>
                  <span className="text-muted-foreground">has</span>
                  <Pill tone="info">{a.role_id}</Pill>
                </div>
                <Button
                  aria-label="Remove role"
                  className="h-7 w-7 shrink-0 p-0 text-muted-foreground"
                  disabled={unassignMutation.isPending}
                  onClick={() =>
                    unassignMutation.mutate({
                      roleId: a.role_id,
                      subjectKind: sKind,
                      subjectId: sId,
                    })
                  }
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })
        )}
      </SettingsFormSection>
    </div>
  );
}
