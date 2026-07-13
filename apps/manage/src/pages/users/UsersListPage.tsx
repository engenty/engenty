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
  Input,
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
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { PageShell } from "@/components/PageShell";
import { PageState } from "@/components/PageState";
import type { TenantRole } from "@/lib/api/tenants";
import { createUser } from "@/lib/api/users";
import { tenantsQuery } from "@/lib/queries/tenants";
import { usersQuery } from "@/lib/queries/users";

export function UsersListPage() {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery(usersQuery);
  const tenants = useQuery(tenantsQuery);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [role, setRole] = useState<TenantRole>("member");
  const [password, setPassword] = useState("");
  const [superAdmin, setSuperAdmin] = useState(false);

  const create = useMutation({
    mutationFn: () =>
      createUser({
        email: email.trim(),
        tenant_id: tenantId,
        display_name: displayName.trim() || undefined,
        password: password.trim() || undefined,
        role,
        is_super_admin: superAdmin,
      }),
    onSuccess: async (user) => {
      toast.success(t("users.create.success"));
      await queryClient.invalidateQueries({ queryKey: ["manage", "users"] });
      setOpen(false);
      navigate(`/users/${user.id}`);
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("common.error")),
  });

  const rows = useMemo(() => {
    const list = data ?? [];
    const term = search.trim().toLowerCase();
    if (!term) {
      return list;
    }
    return list.filter(
      (u) =>
        u.email.toLowerCase().includes(term) ||
        (u.display_name ?? "").toLowerCase().includes(term)
    );
  }, [data, search]);

  const tenantName = (id: string) =>
    tenants.data?.find((tenant) => tenant.id === id)?.name ?? id;

  return (
    <PageShell
      actions={
        <Button onClick={() => setOpen(true)} size="sm">
          {t("users.new")}
        </Button>
      }
      breadcrumbs={[{ label: t("users.title") }]}
      title={t("users.title")}
    >
      <div className="space-y-4 p-page">
        <Input
          aria-label={t("common.search")}
          className="max-w-xs"
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("common.search")}
          value={search}
        />
        <PageState
          error={error}
          isEmpty={rows.length === 0}
          isLoading={isLoading}
          onRetry={() => void refetch()}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.name")}</TableHead>
                <TableHead>{t("common.email")}</TableHead>
                <TableHead>{t("users.primaryTenant")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((user) => (
                <TableRow
                  className="cursor-pointer"
                  key={user.id}
                  onClick={() => navigate(`/users/${user.id}`)}
                >
                  <TableCell className="font-medium">
                    {user.display_name ?? user.email}
                    {user.is_super_admin ? (
                      <Badge className="ml-2" variant="outline">
                        {t("users.superAdmin")}
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {user.email}
                  </TableCell>
                  <TableCell>{tenantName(user.tenant_id)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </PageState>
      </div>

      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("users.create.title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm" htmlFor="new-email">
                {t("users.create.emailLabel")}
              </label>
              <Input
                id="new-email"
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                value={email}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm" htmlFor="new-name">
                {t("users.create.nameLabel")}
              </label>
              <Input
                id="new-name"
                onChange={(e) => setDisplayName(e.target.value)}
                value={displayName}
              />
            </div>
            <div className="space-y-1">
              <span className="text-sm">{t("users.create.tenantLabel")}</span>
              <Select onValueChange={setTenantId} value={tenantId}>
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {(tenants.data ?? []).map((tenant) => (
                    <SelectItem key={tenant.id} value={tenant.id}>
                      {tenant.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <span className="text-sm">{t("users.create.roleLabel")}</span>
              <Select
                onValueChange={(v) => setRole(v as TenantRole)}
                value={role}
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
            <div className="space-y-1">
              <label className="text-sm" htmlFor="new-password">
                {t("users.create.passwordLabel")}
              </label>
              <Input
                id="new-password"
                onChange={(e) => setPassword(e.target.value)}
                type="text"
                value={password}
              />
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Switch
                aria-label={t("users.create.superAdminLabel")}
                checked={superAdmin}
                onCheckedChange={setSuperAdmin}
              />
              {t("users.create.superAdminLabel")}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setOpen(false)} variant="outline">
              {t("common.cancel")}
            </Button>
            <Button
              disabled={!(email.trim() && tenantId) || create.isPending}
              onClick={() => create.mutate()}
            >
              {t("users.create.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
