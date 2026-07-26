import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import {
  Badge,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@engenty/ui-core";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PageShell } from "@/components/PageShell";
import { PageState } from "@/components/PageState";
import { bindModelRole, type ModelRoleBinding } from "@/lib/api/model-bindings";
import {
  modelBindingKeys,
  modelBindingsQuery,
} from "@/lib/queries/model-bindings";

/**
 * The binding console: which model does which job.
 *
 * Every other model surface in the product now talks about effort or purpose,
 * which is the point — but it left "so which model actually runs?" answerable
 * only by reading the database. This is the one screen where a model id is the
 * subject rather than an implementation detail.
 */
function BindingRow({ binding }: { binding: ModelRoleBinding }) {
  const { t } = useTranslation("common");
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(binding.model_id);

  // Re-seed the field when the server value changes underneath (another admin,
  // or our own save landing) so the input never silently diverges from truth.
  useEffect(() => setDraft(binding.model_id), [binding.model_id]);

  const save = useMutation({
    mutationFn: () => bindModelRole(binding.role, draft.trim()),
    onSuccess: async () => {
      toast.success(t("modelBindings.saved", { role: binding.role }));
      await queryClient.invalidateQueries({ queryKey: modelBindingKeys.all });
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("common.error")),
  });

  const dirty = draft.trim() !== binding.model_id && draft.trim().length > 0;

  return (
    <TableRow>
      <TableCell>
        <div className="font-medium text-sm">{binding.label}</div>
        <code className="text-muted-foreground text-xs">{binding.role}</code>
      </TableCell>
      <TableCell>
        {binding.surface === "graded" ? (
          <Badge variant="default">{t("modelBindings.graded")}</Badge>
        ) : (
          <Badge variant="secondary">{t("modelBindings.fixed")}</Badge>
        )}
        {binding.declared_by ? (
          <div className="mt-1 text-muted-foreground text-xs">
            {binding.declared_by}
          </div>
        ) : null}
      </TableCell>
      <TableCell>
        <Input
          className="w-72 font-mono text-xs"
          onBlur={() => dirty && save.mutate()}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && dirty) {
              save.mutate();
            }
          }}
          value={draft}
        />
        {binding.bound ? null : (
          // An unbound role is running on its authored seed. Worth showing:
          // it means nothing has ever been decided here, not that it is broken.
          <div className="mt-1 text-muted-foreground text-xs">
            {t("modelBindings.usingDefault")}
          </div>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground text-xs">
        {binding.gateway}
      </TableCell>
    </TableRow>
  );
}

export function ModelBindingsPage() {
  const { t } = useTranslation("common");
  const { data, isLoading, error, refetch } = useQuery(modelBindingsQuery);

  const breadcrumbs = useMemo(
    () => [
      { label: t("settings.aiModels.menuLabel"), to: "/settings/ai-models" },
      { label: t("modelBindings.title") },
    ],
    [t]
  );

  const graded = data?.filter((b) => b.surface === "graded") ?? [];
  const fixed = data?.filter((b) => b.surface !== "graded") ?? [];

  return (
    <PageShell breadcrumbs={breadcrumbs} title={t("modelBindings.title")}>
      <PageState
        error={error}
        isEmpty={!isLoading && (data?.length ?? 0) === 0}
        isLoading={isLoading}
        onRetry={() => void refetch()}
      >
        <div className="space-y-8 p-page">
          <p className="max-w-prose text-muted-foreground text-sm">
            {t("modelBindings.intro")}
          </p>

          {[
            { rows: graded, key: "gradedHeading" },
            { rows: fixed, key: "fixedHeading" },
          ].map(({ rows, key }) =>
            rows.length === 0 ? null : (
              <section className="space-y-2" key={key}>
                <h2 className="font-medium text-sm">
                  {t(`modelBindings.${key}`)}
                </h2>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("modelBindings.role")}</TableHead>
                      <TableHead>{t("modelBindings.kind")}</TableHead>
                      <TableHead>{t("modelBindings.model")}</TableHead>
                      <TableHead>{t("modelBindings.gateway")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((binding) => (
                      <BindingRow binding={binding} key={binding.role} />
                    ))}
                  </TableBody>
                </Table>
              </section>
            )
          )}
        </div>
      </PageState>
    </PageShell>
  );
}
