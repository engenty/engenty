import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import {
  AdminListTableView,
  Badge,
  Button,
  STICKY_HEADER_CLASS,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@engenty/ui-core";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { PageShell } from "@/components/PageShell";
import { PageState } from "@/components/PageState";
import {
  formatMicros,
  moduleSummary,
} from "@/features/packages/package-format";
import type { EntitlementPackage } from "@/lib/api/entitlements";
import { syncPackageDefaults } from "@/lib/api/entitlements";
import { packagesQuery } from "@/lib/queries/entitlements";

export function PackagesListPage() {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery(packagesQuery);

  const resync = useMutation({
    mutationFn: () => syncPackageDefaults(),
    onSuccess: async (r) => {
      toast.success(t("packages.resynced", { count: r.upserted }));
      await queryClient.invalidateQueries({ queryKey: ["manage", "packages"] });
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("common.error")),
  });

  const packages = (data ?? []) as EntitlementPackage[];
  const packagesTitle = t("packages.title");

  const pageActions = useMemo(
    () => (
      <Button
        disabled={resync.isPending}
        onClick={() => resync.mutate()}
        size="sm"
        variant="outline"
      >
        {t("packages.resync")}
      </Button>
    ),
    [resync.isPending, t]
  );

  const breadcrumbs = useMemo(
    () => [
      {
        label: (
          <span className="font-medium text-foreground text-sm">
            {packagesTitle}
          </span>
        ),
        menuLabel: packagesTitle,
        to: "/packages",
      },
    ],
    [packagesTitle]
  );

  return (
    <PageShell actions={pageActions} breadcrumbs={breadcrumbs}>
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-page">
        <p className="text-muted-foreground text-sm">
          {t("packages.subtitle")}
        </p>
        <PageState
          error={error}
          isEmpty={packages.length === 0}
          isLoading={isLoading}
          onRetry={() => void refetch()}
        >
          <AdminListTableView>
            <Table noWrapper>
              <TableHeader className={STICKY_HEADER_CLASS}>
                <TableRow>
                  <TableHead>{t("packages.columns.package")}</TableHead>
                  <TableHead>{t("packages.columns.modules")}</TableHead>
                  <TableHead>{t("packages.columns.seats")}</TableHead>
                  <TableHead>{t("packages.columns.aiLimit")}</TableHead>
                  <TableHead>{t("packages.columns.enforcement")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {packages.map((pkg) => (
                  <TableRow
                    className="cursor-pointer"
                    key={pkg.id}
                    onClick={() => navigate(`/packages/${pkg.id}`)}
                  >
                    <TableCell>
                      <div className="font-medium">{pkg.label}</div>
                      <div className="text-muted-foreground text-xs">
                        {pkg.id} · v{pkg.version}
                      </div>
                    </TableCell>
                    <TableCell>
                      {moduleSummary(pkg.modules, t("packages.allModules"))}
                    </TableCell>
                    <TableCell>{pkg.appLimits?.maxUsers ?? "∞"}</TableCell>
                    <TableCell>
                      {formatMicros(pkg.aiUsagePolicy?.hard_limit_cost_micros)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          pkg.aiUsagePolicy?.enforcement_mode === "enforce"
                            ? "default"
                            : "secondary"
                        }
                      >
                        {t(
                          `packages.mode.${pkg.aiUsagePolicy?.enforcement_mode ?? "observe"}`
                        )}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </AdminListTableView>
        </PageState>
      </div>
    </PageShell>
  );
}
