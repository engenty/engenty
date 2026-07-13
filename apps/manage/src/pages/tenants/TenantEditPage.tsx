import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@engenty/ui-core";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { PageShell } from "@/components/PageShell";
import { PageState } from "@/components/PageState";
import { type TenantTier, updateTenant } from "@/lib/api/tenants";
import { tenantQuery } from "@/lib/queries/tenants";

export function TenantEditPage() {
  const { t } = useTranslation("common");
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: tenant, isLoading, error, refetch } = useQuery(tenantQuery(id));
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [tier, setTier] = useState<TenantTier>("platform");

  useEffect(() => {
    if (tenant) {
      setName(tenant.name);
      setSlug(tenant.slug);
      setTier(tenant.tier);
    }
  }, [tenant]);

  const save = useMutation({
    mutationFn: () =>
      updateTenant(id, { name: name.trim(), slug: slug.trim(), tier }),
    onSuccess: async () => {
      toast.success(t("tenants.edit.success"));
      await queryClient.invalidateQueries({ queryKey: ["manage", "tenants"] });
      navigate(`/tenants/${id}`);
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("common.error")),
  });

  return (
    <PageShell
      breadcrumbs={[
        { label: t("tenants.title"), to: "/tenants" },
        { label: tenant?.name ?? "…", to: `/tenants/${id}` },
        { label: t("tenants.edit.title") },
      ]}
      title={t("tenants.edit.title")}
    >
      <div className="max-w-md space-y-4 p-page">
        <PageState
          error={error}
          isLoading={isLoading}
          onRetry={() => void refetch()}
        >
          <div className="space-y-1">
            <label className="text-sm" htmlFor="edit-name">
              {t("common.name")}
            </label>
            <Input
              id="edit-name"
              onChange={(e) => setName(e.target.value)}
              value={name}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm" htmlFor="edit-slug">
              {t("common.slug")}
            </label>
            <Input
              id="edit-slug"
              onChange={(e) => setSlug(e.target.value)}
              value={slug}
            />
          </div>
          <div className="space-y-1">
            <span className="text-sm">{t("tenants.fields.tier")}</span>
            <Select
              onValueChange={(v) => setTier(v as TenantTier)}
              value={tier}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="platform">
                  {t("tenants.tier.platform")}
                </SelectItem>
                <SelectItem value="satellite">
                  {t("tenants.tier.satellite")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button
              disabled={!(name.trim() && slug.trim()) || save.isPending}
              onClick={() => save.mutate()}
            >
              {t("common.save")}
            </Button>
            <Button
              onClick={() => navigate(`/tenants/${id}`)}
              variant="outline"
            >
              {t("common.cancel")}
            </Button>
          </div>
        </PageState>
      </div>
    </PageShell>
  );
}
