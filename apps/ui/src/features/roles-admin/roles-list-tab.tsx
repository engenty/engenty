// Roles tab: every role profile the system knows — core built-ins, module
// viewer/editor bundles, and tenant-defined custom roles — grouped by source,
// each group its own section. Custom.* roles are create/edit/delete here;
// system profiles stay code-owned (role-profiles.ts + module plugins).

import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  SettingsFormCard,
  Textarea,
} from "@engenty/ui-core";
import { Pencil, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
  type AuthzRole,
  createTenantRole,
  deleteTenantRole,
  listRoles,
  listTenantRoles,
  type TenantRole,
  updateTenantRole,
} from "@/lib/authz-admin-api";
import { Pill } from "./pills";

export const ROLES_QUERY_KEY = ["authz-admin", "roles"];
export const TENANT_ROLES_QUERY_KEY = ["authz-admin", "tenant-roles"];

interface Props {
  newRoleOpen: boolean;
  onNewRoleOpenChange: (open: boolean) => void;
  tenantId: string;
}

function parseCapabilities(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map((c) => c.trim())
    .filter(Boolean);
}

function Caps({ capabilities }: { capabilities: string[] }) {
  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      {capabilities.map((cap) => (
        <code
          className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground leading-none"
          key={cap}
        >
          {cap}
        </code>
      ))}
    </div>
  );
}

function RoleRow({
  id,
  title,
  badge,
  capabilities,
  action,
}: {
  id: string;
  title: string;
  badge?: React.ReactNode;
  capabilities: string[];
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-border-soft border-b py-2.5 last:border-0">
      <div className="flex min-w-0 items-center gap-2 pt-0.5">
        <code className="font-mono text-foreground text-sm">{id}</code>
        {badge}
        <span className="truncate text-muted-foreground text-xs">{title}</span>
      </div>
      <div className="flex items-start gap-2">
        <Caps capabilities={capabilities} />
        {action}
      </div>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="px-0.5 font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
      {children}
    </h3>
  );
}

export function RolesListTab({
  tenantId,
  newRoleOpen,
  onNewRoleOpenChange,
}: Props) {
  const queryClient = useQueryClient();
  const rolesQuery = useQuery({
    queryKey: ROLES_QUERY_KEY,
    queryFn: listRoles,
  });
  const customQuery = useQuery({
    queryKey: TENANT_ROLES_QUERY_KEY,
    queryFn: () => listTenantRoles(tenantId),
  });

  const [roleId, setRoleId] = useState("custom.");
  const [title, setTitle] = useState("");
  const [capsText, setCapsText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<TenantRole | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCapsText, setEditCapsText] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: TENANT_ROLES_QUERY_KEY });

  const openEdit = (role: TenantRole) => {
    setEditing(role);
    setEditTitle(role.title);
    setEditDescription(role.description ?? "");
    setEditCapsText(role.capabilities.join("\n"));
    setEditError(null);
  };

  const closeEdit = () => {
    setEditing(null);
    setEditError(null);
  };

  const createMutation = useMutation({
    mutationFn: () =>
      createTenantRole(tenantId, {
        roleId: roleId.trim(),
        title: title.trim(),
        capabilities: parseCapabilities(capsText),
      }),
    onSuccess: () => {
      onNewRoleOpenChange(false);
      setRoleId("custom.");
      setTitle("");
      setCapsText("");
      setError(null);
      invalidate();
    },
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message : "Failed to create role"),
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!editing) {
        throw new Error("No role selected");
      }
      return updateTenantRole(tenantId, editing.role_id, {
        title: editTitle.trim(),
        description: editDescription.trim() ? editDescription.trim() : null,
        capabilities: parseCapabilities(editCapsText),
      });
    },
    onSuccess: () => {
      closeEdit();
      invalidate();
    },
    onError: (e: unknown) =>
      setEditError(e instanceof Error ? e.message : "Failed to update role"),
  });

  const deleteMutation = useMutation({
    mutationFn: (rid: string) => deleteTenantRole(tenantId, rid),
    onSuccess: invalidate,
  });

  const grouped = useMemo(() => {
    const bySource = new Map<string, AuthzRole[]>();
    for (const role of rolesQuery.data ?? []) {
      const list = bySource.get(role.source) ?? [];
      list.push(role);
      bySource.set(role.source, list);
    }
    return [...bySource.entries()].sort(([a], [b]) =>
      a === "core" ? -1 : b === "core" ? 1 : a.localeCompare(b)
    );
  }, [rolesQuery.data]);

  const customRoles = (customQuery.data ?? []) as TenantRole[];

  return (
    <div className="space-y-5">
      <p className="text-muted-foreground text-sm">
        Named capability bundles assigned to users or agents on the Assignments
        tab. Custom roles are tenant-defined and editable here (explicit caps,
        no wildcards). System profiles are code-owned and read-only.
      </p>

      {customRoles.length > 0 && (
        <section className="space-y-1.5">
          <SectionHeading>Custom</SectionHeading>
          <SettingsFormCard className="space-y-0">
            {customRoles.map((role) => (
              <RoleRow
                action={
                  <div className="flex shrink-0 items-start gap-0.5">
                    <Button
                      aria-label={`Edit ${role.role_id}`}
                      className="h-7 w-7 p-0 text-muted-foreground"
                      onClick={() => openEdit(role)}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      aria-label={`Delete ${role.role_id}`}
                      className="h-7 w-7 p-0 text-muted-foreground"
                      disabled={deleteMutation.isPending}
                      onClick={() => deleteMutation.mutate(role.role_id)}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                }
                badge={<Pill tone="accent">custom</Pill>}
                capabilities={role.capabilities}
                id={role.role_id}
                key={role.id}
                title={role.title}
              />
            ))}
          </SettingsFormCard>
        </section>
      )}

      {grouped.map(([source, roles]) => (
        <section className="space-y-1.5" key={source}>
          <SectionHeading>{source}</SectionHeading>
          <SettingsFormCard className="space-y-0">
            {roles.map((role) => (
              <RoleRow
                badge={role.system ? <Pill tone="info">system</Pill> : null}
                capabilities={role.capabilities}
                id={role.id}
                key={role.id}
                title={role.title}
              />
            ))}
          </SettingsFormCard>
        </section>
      ))}

      <Dialog onOpenChange={onNewRoleOpenChange} open={newRoleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New custom role</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="role-id">Role id</Label>
              <Input
                id="role-id"
                onChange={(e) => setRoleId(e.target.value)}
                placeholder="custom.billing"
                value={roleId}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="role-title">Title</Label>
              <Input
                id="role-title"
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Billing"
                value={title}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="role-caps">Capabilities</Label>
              <Textarea
                id="role-caps"
                onChange={(e) => setCapsText(e.target.value)}
                placeholder={"module.invoices.read\nmodule.invoices.write"}
                rows={4}
                value={capsText}
              />
              <p className="text-muted-foreground text-xs">
                One per line. No wildcards; each must be a real capability you
                hold (see the Capabilities tab).
              </p>
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
          </div>
          <DialogFooter>
            <Button
              onClick={() => onNewRoleOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={createMutation.isPending}
              onClick={() => createMutation.mutate()}
              type="button"
            >
              Create role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            closeEdit();
          }
        }}
        open={editing !== null}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit custom role</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-role-id">Role id</Label>
                <Input
                  disabled
                  id="edit-role-id"
                  readOnly
                  value={editing.role_id}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-role-title">Title</Label>
                <Input
                  id="edit-role-title"
                  onChange={(e) => setEditTitle(e.target.value)}
                  value={editTitle}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-role-description">Description</Label>
                <Input
                  id="edit-role-description"
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Optional"
                  value={editDescription}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-role-caps">Capabilities</Label>
                <Textarea
                  id="edit-role-caps"
                  onChange={(e) => setEditCapsText(e.target.value)}
                  rows={5}
                  value={editCapsText}
                />
                <p className="text-muted-foreground text-xs">
                  One per line. No wildcards; each must be a real capability you
                  hold (see the Capabilities tab).
                </p>
              </div>
              {editError && (
                <p className="text-destructive text-sm">{editError}</p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={closeEdit} type="button" variant="outline">
              Cancel
            </Button>
            <Button
              disabled={updateMutation.isPending || !editTitle.trim()}
              onClick={() => updateMutation.mutate()}
              type="button"
            >
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
