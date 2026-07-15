import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import {
  AdminListTableView,
  Badge,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  STICKY_HEADER_CLASS,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@engenty/ui-core";
import { useState } from "react";
import { toast } from "sonner";
import { PageShell } from "@/components/PageShell";
import { PageState } from "@/components/PageState";
import {
  type ApprovalDecision,
  type ApprovalRequest,
  decideApproval,
} from "@/lib/api/approvals";
import { pendingApprovalsQuery } from "@/lib/queries/approvals";
import { tenantsQuery } from "@/lib/queries/tenants";

type AllowScope = "allow_once" | "allow_session" | "allow_policy";

const ALLOW_SCOPES: AllowScope[] = [
  "allow_once",
  "allow_session",
  "allow_policy",
];

export function ApprovalsPage() {
  const { t } = useTranslation("common");
  const queryClient = useQueryClient();
  const approvals = useQuery(pendingApprovalsQuery);
  const tenants = useQuery(tenantsQuery);

  // Chosen allow-scope per pending request; defaults to allow_once.
  const [scopes, setScopes] = useState<Record<string, AllowScope>>({});

  const decide = useMutation({
    mutationFn: (vars: { id: string; decision: ApprovalDecision }) =>
      decideApproval(vars.id, vars.decision),
    onSuccess: async (_data, vars) => {
      toast.success(
        vars.decision === "deny"
          ? t("approvals.denied")
          : t("approvals.approved")
      );
      await queryClient.invalidateQueries({
        queryKey: ["manage", "approvals", "pending"],
      });
    },
    onError: (err) =>
      toast.error(
        err instanceof Error ? err.message : t("approvals.decideFailed")
      ),
  });

  const rows = approvals.data ?? [];

  const tenantName = (id: string) => {
    if (!id) {
      return t("approvals.platformScope");
    }
    return tenants.data?.find((tenant) => tenant.id === id)?.name ?? id;
  };

  return (
    <PageShell
      breadcrumbs={[{ label: t("approvals.title") }]}
      title={t("approvals.title")}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-page">
        <PageState
          error={approvals.error}
          isEmpty={rows.length === 0}
          isLoading={approvals.isLoading}
          onRetry={() => void approvals.refetch()}
        >
          <AdminListTableView>
            <Table noWrapper>
              <TableHeader className={STICKY_HEADER_CLASS}>
                <TableRow>
                  <TableHead>{t("approvals.columns.operation")}</TableHead>
                  <TableHead className="w-40">
                    {t("approvals.columns.tenant")}
                  </TableHead>
                  <TableHead className="w-40">
                    {t("approvals.columns.actor")}
                  </TableHead>
                  <TableHead className="w-44">
                    {t("approvals.columns.requested")}
                  </TableHead>
                  <TableHead className="w-[22rem] text-right">
                    {t("approvals.columns.decision")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((request) => (
                  <ApprovalRow
                    isDeciding={decide.isPending}
                    key={request.id}
                    onDecide={(decision) =>
                      decide.mutate({ id: request.id, decision })
                    }
                    onScopeChange={(scope) =>
                      setScopes((prev) => ({ ...prev, [request.id]: scope }))
                    }
                    request={request}
                    scope={scopes[request.id] ?? "allow_once"}
                    t={t}
                    tenantName={tenantName(request.tenantId)}
                  />
                ))}
              </TableBody>
            </Table>
          </AdminListTableView>
        </PageState>
      </div>
    </PageShell>
  );
}

function ApprovalRow({
  request,
  scope,
  tenantName,
  isDeciding,
  onScopeChange,
  onDecide,
  t,
}: {
  request: ApprovalRequest;
  scope: AllowScope;
  tenantName: string;
  isDeciding: boolean;
  onScopeChange: (scope: AllowScope) => void;
  onDecide: (decision: ApprovalDecision) => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  return (
    <TableRow className="align-top">
      <TableCell>
        <p className="font-medium text-sm">{request.operationId}</p>
        <p className="font-mono text-muted-foreground text-xs">
          {request.moduleId}
        </p>
        {request.reason ? (
          <p className="mt-1 max-w-md text-muted-foreground text-xs">
            {request.reason}
          </p>
        ) : null}
      </TableCell>
      <TableCell className="text-sm">{tenantName}</TableCell>
      <TableCell className="font-mono text-muted-foreground text-xs">
        {request.actorId || "—"}
      </TableCell>
      <TableCell className="text-muted-foreground text-xs">
        <span className="block">{formatTime(request.createdAt)}</span>
        <Badge className="mt-1" variant="outline">
          {t("approvals.expires", { time: formatTime(request.expiresAt) })}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-2">
          <Select
            onValueChange={(value) => onScopeChange(value as AllowScope)}
            value={scope}
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ALLOW_SCOPES.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`approvals.scope.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            disabled={isDeciding}
            onClick={() => onDecide(scope)}
            size="sm"
          >
            {t("approvals.approve")}
          </Button>
          <Button
            className="border-destructive text-destructive hover:bg-destructive/10"
            disabled={isDeciding}
            onClick={() => onDecide("deny")}
            size="sm"
            variant="outline"
          >
            {t("approvals.deny")}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function formatTime(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    return iso || "—";
  }
  return new Date(ms).toLocaleString();
}
