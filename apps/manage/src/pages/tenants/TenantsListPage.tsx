import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import {
  AdminListTableView,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  STICKY_HEADER_CLASS,
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
import { StatusBadge, TierBadge } from "@/components/tenant-badges";
import { createTenant } from "@/lib/api/tenants";
import { tenantsQuery } from "@/lib/queries/tenants";

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function TenantsListPage() {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery(tenantsQuery);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);

  const create = useMutation({
    mutationFn: () => createTenant({ slug: slug.trim(), name: name.trim() }),
    onSuccess: async (tenant) => {
      toast.success(t("tenants.create.success"));
      await queryClient.invalidateQueries({ queryKey: ["manage", "tenants"] });
      setCreateOpen(false);
      setName("");
      setSlug("");
      setSlugEdited(false);
      navigate(`/tenants/${tenant.id}`);
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
      (tenant) =>
        tenant.name.toLowerCase().includes(term) ||
        tenant.slug.toLowerCase().includes(term)
    );
  }, [data, search]);

  return (
    <PageShell
      actions={
        <Button onClick={() => setCreateOpen(true)} size="sm">
          {t("tenants.new")}
        </Button>
      }
      breadcrumbs={[{ label: t("tenants.title") }]}
      title={t("tenants.title")}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-page">
        <Input
          aria-label={t("common.search")}
          className="max-w-xs shrink-0"
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
          <AdminListTableView>
            <Table noWrapper>
              <TableHeader className={STICKY_HEADER_CLASS}>
                <TableRow>
                  <TableHead>{t("common.name")}</TableHead>
                  <TableHead>{t("common.slug")}</TableHead>
                  <TableHead>{t("tenants.fields.tier")}</TableHead>
                  <TableHead>{t("tenants.fields.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((tenant) => (
                  <TableRow
                    className="cursor-pointer"
                    key={tenant.id}
                    onClick={() => navigate(`/tenants/${tenant.id}`)}
                  >
                    <TableCell className="font-medium">{tenant.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {tenant.slug}
                    </TableCell>
                    <TableCell>
                      <TierBadge tier={tenant.tier} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={tenant.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </AdminListTableView>
        </PageState>
      </div>

      <Dialog onOpenChange={setCreateOpen} open={createOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("tenants.create.title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm" htmlFor="tenant-name">
                {t("tenants.create.nameLabel")}
              </label>
              <Input
                id="tenant-name"
                onChange={(e) => {
                  setName(e.target.value);
                  if (!slugEdited) {
                    setSlug(slugify(e.target.value));
                  }
                }}
                value={name}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm" htmlFor="tenant-slug">
                {t("tenants.create.slugLabel")}
              </label>
              <Input
                id="tenant-slug"
                onChange={(e) => {
                  setSlugEdited(true);
                  setSlug(e.target.value);
                }}
                value={slug}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setCreateOpen(false)} variant="outline">
              {t("common.cancel")}
            </Button>
            <Button
              disabled={!(name.trim() && slug.trim()) || create.isPending}
              onClick={() => create.mutate()}
            >
              {t("tenants.create.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
