import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import {
  Badge,
  Button,
  DetailPageHeader,
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
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PageState } from "@/components/PageState";
import {
  assignMember,
  removeMember,
  type TenantRole,
  updateMemberRole,
} from "@/lib/api/tenants";
import { updateUser } from "@/lib/api/users";
import { tenantsQuery } from "@/lib/queries/tenants";
import { userQuery } from "@/lib/queries/users";

export function UserDetailPage() {
  const { t } = useTranslation("common");
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery(userQuery(id));
  const tenants = useQuery(tenantsQuery);
  const [confirmSuperAdmin, setConfirmSuperAdmin] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addTenant, setAddTenant] = useState("");
  const [addRole, setAddRole] = useState<TenantRole>("member");

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["manage", "users", id] });

  const toggleSuperAdmin = useMutation({
    mutationFn: (next: boolean) => updateUser(id, { is_super_admin: next }),
    onSuccess: async () => {
      toast.success(t("users.detail.updated"));
      await invalidate();
      setConfirmSuperAdmin(false);
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("common.error")),
  });

  const changeRole = useMutation({
    mutationFn: (vars: { tenantId: string; role: TenantRole }) =>
      updateMemberRole(vars.tenantId, id, vars.role),
    onSuccess: async () => {
      toast.success(t("tenants.members.roleChanged"));
      await invalidate();
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("common.error")),
  });

  const removeFrom = useMutation({
    mutationFn: (tenantId: string) => removeMember(tenantId, id),
    onSuccess: async () => {
      toast.success(t("tenants.members.removed"));
      await invalidate();
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("common.error")),
  });

  const addMembership = useMutation({
    mutationFn: () => assignMember(addTenant, { userId: id, role: addRole }),
    onSuccess: async () => {
      toast.success(t("tenants.members.added"));
      await invalidate();
      setAddOpen(false);
      setAddTenant("");
      setAddRole("member");
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("common.error")),
  });

  const candidateTenants = useMemo(() => {
    const has = new Set(
      (data?.tenant_memberships ?? []).map((m) => m.tenant_id)
    );
    return (tenants.data ?? []).filter((tenant) => !has.has(tenant.id));
  }, [data?.tenant_memberships, tenants.data]);

  const user = data?.user;
  const title = user?.display_name ?? user?.email ?? "…";

  const breadcrumbs = useMemo(
    () => [{ label: t("users.title"), to: "/users" }, { label: title }],
    [t, title]
  );

  const pageActions = useMemo(
    () =>
      user ? (
        <Button
          onClick={() => navigate(`/users/${id}/edit`)}
          size="sm"
          variant="outline"
        >
          {t("common.edit")}
        </Button>
      ) : null,
    [id, navigate, t, user]
  );

  usePageConfig({
    actions: pageActions,
    breadcrumbs,
    contentStackBackground: "paper",
    topbarChrome: "contentBlend",
    topbarOverlap: true,
  });

  if (isLoading || error || !(data && user)) {
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto pt-11">
        <PageState
          error={error}
          isEmpty={!(isLoading || error)}
          isLoading={isLoading}
          onRetry={() => void refetch()}
        >
          {null}
        </PageState>
      </div>
    );
  }

  const showEmailEyebrow =
    Boolean(user.display_name?.trim()) && user.display_name !== user.email;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <DetailPageHeader
        description={
          data.identities.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              {data.identities.map((identity) => (
                <Badge key={identity.provider} variant="secondary">
                  {identity.provider}
                </Badge>
              ))}
            </div>
          ) : null
        }
        eyebrow={showEmailEyebrow ? user.email : undefined}
        maxWidth="5xl"
        status={
          user.is_super_admin ? (
            <Badge variant="outline">{t("users.superAdmin")}</Badge>
          ) : undefined
        }
        title={title}
      />

      <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto p-page pb-10">
        <div className="mx-auto w-full max-w-5xl space-y-6">
          <div className="flex items-center gap-2 text-sm">
            <Switch
              aria-label={t("users.detail.superAdminToggle")}
              checked={user.is_super_admin}
              onCheckedChange={() => setConfirmSuperAdmin(true)}
            />
            {t("users.detail.superAdminToggle")}
          </div>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-medium text-sm">
                {t("users.detail.memberships")}
              </h2>
              <Button onClick={() => setAddOpen(true)} size="sm">
                {t("users.detail.addMembership")}
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("common.name")}</TableHead>
                  <TableHead>{t("common.role")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.tenant_memberships.map((membership) => (
                  <TableRow key={membership.tenant_id}>
                    <TableCell className="font-medium">
                      {membership.tenant_name}
                    </TableCell>
                    <TableCell>
                      <Select
                        onValueChange={(role) =>
                          changeRole.mutate({
                            tenantId: membership.tenant_id,
                            role: role as TenantRole,
                          })
                        }
                        value={membership.role}
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
                        onClick={() => removeFrom.mutate(membership.tenant_id)}
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
          </section>
        </div>
      </div>

      <ConfirmDialog
        confirmLabel={t("common.confirm")}
        description={t("users.detail.superAdminConfirm")}
        onConfirm={() => toggleSuperAdmin.mutate(!user.is_super_admin)}
        onOpenChange={(open) => !open && setConfirmSuperAdmin(false)}
        open={confirmSuperAdmin}
        title={t("users.detail.superAdminToggle")}
      />

      <Dialog onOpenChange={setAddOpen} open={addOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("users.detail.addMembership")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Select onValueChange={setAddTenant} value={addTenant}>
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                {candidateTenants.map((tenant) => (
                  <SelectItem key={tenant.id} value={tenant.id}>
                    {tenant.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              onValueChange={(v) => setAddRole(v as TenantRole)}
              value={addRole}
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
          <DialogFooter>
            <Button onClick={() => setAddOpen(false)} variant="outline">
              {t("common.cancel")}
            </Button>
            <Button
              disabled={!addTenant || addMembership.isPending}
              onClick={() => addMembership.mutate()}
            >
              {t("common.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
