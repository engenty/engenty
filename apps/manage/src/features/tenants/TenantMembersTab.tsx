import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@engenty/ui-core";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PageState } from "@/components/PageState";
import {
  assignMember,
  removeMember,
  type TenantMember,
  type TenantRole,
  updateMemberRole,
} from "@/lib/api/tenants";
import { tenantMembersQuery } from "@/lib/queries/tenants";
import { usersQuery } from "@/lib/queries/users";

export function TenantMembersTab({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation("common");
  const queryClient = useQueryClient();
  const membersQuery = useQuery(tenantMembersQuery(tenantId));
  const allUsers = useQuery(usersQuery);
  const [addOpen, setAddOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState("");
  const [newRole, setNewRole] = useState<TenantRole>("member");
  const [removing, setRemoving] = useState<TenantMember | null>(null);

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ["manage", "tenants", tenantId, "members"],
    });

  const add = useMutation({
    mutationFn: () =>
      assignMember(tenantId, { userId: selectedUser, role: newRole }),
    onSuccess: async () => {
      toast.success(t("tenants.members.added"));
      await invalidate();
      setAddOpen(false);
      setSelectedUser("");
      setNewRole("member");
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("common.error")),
  });

  const changeRole = useMutation({
    mutationFn: (vars: { userId: string; role: TenantRole }) =>
      updateMemberRole(tenantId, vars.userId, vars.role),
    onSuccess: async () => {
      toast.success(t("tenants.members.roleChanged"));
      await invalidate();
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("common.error")),
  });

  const remove = useMutation({
    mutationFn: (userId: string) => removeMember(tenantId, userId),
    onSuccess: async () => {
      toast.success(t("tenants.members.removed"));
      await invalidate();
      setRemoving(null);
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("common.error")),
  });

  const candidateUsers = useMemo(() => {
    const memberIds = new Set((membersQuery.data ?? []).map((m) => m.id));
    return (allUsers.data ?? []).filter((u) => !memberIds.has(u.id));
  }, [allUsers.data, membersQuery.data]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setAddOpen(true)} size="sm">
          {t("tenants.members.add")}
        </Button>
      </div>
      <PageState
        error={membersQuery.error}
        isEmpty={(membersQuery.data?.length ?? 0) === 0}
        isLoading={membersQuery.isLoading}
        onRetry={() => void membersQuery.refetch()}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("common.name")}</TableHead>
              <TableHead>{t("common.email")}</TableHead>
              <TableHead>{t("common.role")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(membersQuery.data ?? []).map((member) => (
              <TableRow key={member.id}>
                <TableCell className="font-medium">
                  {member.display_name ?? member.email}
                  {member.is_super_admin ? (
                    <Badge className="ml-2" variant="outline">
                      {t("users.superAdmin")}
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {member.email}
                </TableCell>
                <TableCell>
                  <Select
                    onValueChange={(role) =>
                      changeRole.mutate({
                        userId: member.id,
                        role: role as TenantRole,
                      })
                    }
                    value={member.tenant_role}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">admin</SelectItem>
                      <SelectItem value="member">member</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    onClick={() => setRemoving(member)}
                    size="sm"
                    variant="ghost"
                  >
                    {t("common.remove")}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </PageState>

      <Dialog onOpenChange={setAddOpen} open={addOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("tenants.members.addTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <span className="text-sm">{t("tenants.members.userLabel")}</span>
              <Select onValueChange={setSelectedUser} value={selectedUser}>
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {candidateUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.display_name ?? u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <span className="text-sm">{t("tenants.members.roleLabel")}</span>
              <Select
                onValueChange={(v) => setNewRole(v as TenantRole)}
                value={newRole}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">admin</SelectItem>
                  <SelectItem value="member">member</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setAddOpen(false)} variant="outline">
              {t("common.cancel")}
            </Button>
            <Button
              disabled={!selectedUser || add.isPending}
              onClick={() => add.mutate()}
            >
              {t("common.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        confirmLabel={t("common.remove")}
        description={t("tenants.members.removeConfirm")}
        destructive
        onConfirm={() => removing && remove.mutate(removing.id)}
        onOpenChange={(open) => !open && setRemoving(null)}
        open={removing !== null}
        title={t("tenants.members.removeTitle")}
      />
    </div>
  );
}
