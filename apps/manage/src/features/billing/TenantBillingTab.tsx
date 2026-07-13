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
import { toast } from "sonner";
import { PageState } from "@/components/PageState";
import {
  generateInvoice,
  type Invoice,
  type InvoiceStatus,
} from "@/lib/api/billing";
import { invoicesQuery } from "@/lib/queries/billing";

const STATUS_VARIANT: Record<
  InvoiceStatus,
  "default" | "secondary" | "outline"
> = {
  paid: "default",
  open: "secondary",
  draft: "outline",
  void: "outline",
};

function formatMoney(micros: number, currency: string): string {
  return `${(micros / 1_000_000).toLocaleString(undefined, {
    style: "currency",
    currency: currency.toUpperCase(),
  })}`;
}

/** Current calendar month as [firstDay, lastDay] ISO dates. */
function currentMonthPeriod(): { period_start: string; period_end: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    timeZone: "UTC",
  }).formatToParts(new Date());
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${lastDay}`;
  return { period_start: start, period_end: end };
}

export function TenantBillingTab({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation("common");
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery(invoicesQuery(tenantId));

  const generate = useMutation({
    mutationFn: () => generateInvoice(tenantId, currentMonthPeriod()),
    onSuccess: async () => {
      toast.success(t("billing.generated"));
      await queryClient.invalidateQueries({
        queryKey: ["manage", "tenants", tenantId, "invoices"],
      });
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("common.error")),
  });

  const invoices = (data ?? []) as Invoice[];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-page">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">{t("billing.subtitle")}</p>
        <Button
          disabled={generate.isPending}
          onClick={() => generate.mutate()}
          size="sm"
        >
          {t("billing.generate")}
        </Button>
      </div>
      <PageState
        error={error}
        isEmpty={invoices.length === 0}
        isLoading={isLoading}
        onRetry={() => void refetch()}
      >
        <AdminListTableView>
          <Table noWrapper>
            <TableHeader className={STICKY_HEADER_CLASS}>
              <TableRow>
                <TableHead>{t("billing.columns.period")}</TableHead>
                <TableHead>{t("billing.columns.package")}</TableHead>
                <TableHead>{t("billing.columns.total")}</TableHead>
                <TableHead>{t("billing.columns.status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell>
                    {inv.period_start} → {inv.period_end}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {inv.package_id ?? "—"}
                  </TableCell>
                  <TableCell className="font-medium">
                    {formatMoney(inv.total_micros, inv.currency)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[inv.status]}>
                      {t(`billing.status.${inv.status}`)}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </AdminListTableView>
      </PageState>
    </div>
  );
}
