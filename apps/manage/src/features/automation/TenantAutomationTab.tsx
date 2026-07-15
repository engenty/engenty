import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import {
  Badge,
  Button,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@engenty/ui-core";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PageState } from "@/components/PageState";
import {
  type AutomationRule,
  deleteAutomationRule,
  setAutomationRuleEnabled,
} from "@/lib/api/automation";
import { tenantAutomationRulesQuery } from "@/lib/queries/automation";

export function TenantAutomationTab({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation("common");
  const queryClient = useQueryClient();
  const rulesQuery = useQuery(tenantAutomationRulesQuery(tenantId));
  const [removing, setRemoving] = useState<AutomationRule | null>(null);

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ["manage", "tenants", tenantId, "automation-rules"],
    });

  const toggle = useMutation({
    mutationFn: (vars: { ruleId: string; enabled: boolean }) =>
      setAutomationRuleEnabled(tenantId, vars.ruleId, vars.enabled),
    onSuccess: async () => {
      await invalidate();
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("common.error")),
  });

  const remove = useMutation({
    mutationFn: (ruleId: string) => deleteAutomationRule(tenantId, ruleId),
    onSuccess: async () => {
      toast.success(t("tenants.automation.removed"));
      await invalidate();
      setRemoving(null);
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("common.error")),
  });

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        {t("tenants.automation.hint")}
      </p>
      <PageState
        error={rulesQuery.error}
        isEmpty={(rulesQuery.data?.length ?? 0) === 0}
        isLoading={rulesQuery.isLoading}
        onRetry={() => void rulesQuery.refetch()}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("tenants.automation.columns.hook")}</TableHead>
              <TableHead>{t("tenants.automation.columns.effect")}</TableHead>
              <TableHead className="w-28">
                {t("tenants.automation.columns.enabled")}
              </TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(rulesQuery.data ?? []).map((rule) => (
              <TableRow key={rule.id}>
                <TableCell className="font-mono text-xs">
                  {rule.hook_id}
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-2">
                    <Badge variant="outline">{rule.effect_type}</Badge>
                    <span className="font-mono text-xs">{rule.effect_id}</span>
                  </span>
                </TableCell>
                <TableCell>
                  <Switch
                    aria-label={rule.hook_id}
                    checked={rule.enabled}
                    disabled={toggle.isPending}
                    onCheckedChange={(enabled) =>
                      toggle.mutate({ ruleId: rule.id, enabled })
                    }
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    onClick={() => setRemoving(rule)}
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

      <ConfirmDialog
        confirmLabel={t("common.remove")}
        description={t("tenants.automation.removeConfirm")}
        destructive
        onConfirm={() => removing && remove.mutate(removing.id)}
        onOpenChange={(open) => !open && setRemoving(null)}
        open={removing !== null}
        title={t("tenants.automation.removeTitle")}
      />
    </div>
  );
}
